import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer as createViteServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.join(__dirname, 'api');
const port = Number(process.env.PORT || 5173);

function loadEnvFile(fileName) {
  const filePath = path.join(__dirname, fileName);
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;

    const index = trimmed.indexOf('=');
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

function listApiFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listApiFiles(fullPath);
    return entry.isFile() && entry.name.endsWith('.js') ? [fullPath] : [];
  });
}

function routeFromFile(filePath) {
  const relative = path.relative(apiDir, filePath).replace(/\\/g, '/').replace(/\.js$/, '');
  const route = `/api/${relative}`;
  const segments = route.split('/').filter(Boolean);
  const keys = [];
  const pattern = segments.map((segment) => {
    const match = segment.match(/^\[(.+)\]$/);
    if (!match) return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    keys.push(match[1]);
    return '([^/]+)';
  }).join('/');

  return {
    filePath,
    keys,
    route,
    dynamicCount: keys.length,
    segmentCount: segments.length,
    regexp: new RegExp(`^/${pattern}/?$`)
  };
}

const routes = listApiFiles(apiDir)
  .map(routeFromFile)
  .sort((a, b) => a.dynamicCount - b.dynamicCount || b.segmentCount - a.segmentCount);

function matchApiRoute(urlPath) {
  for (const route of routes) {
    const match = route.regexp.exec(urlPath);
    if (!match) continue;

    return {
      route,
      params: Object.fromEntries(route.keys.map((key, index) => [key, match[index + 1]]))
    };
  }

  return null;
}

function setNotFound(res) {
  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ message: 'API route not found.' }));
}

const vite = await createViteServer({
  server: {
    middlewareMode: true,
    hmr: {
      port: Number(process.env.VITE_HMR_PORT || 24678)
    }
  },
  appType: 'spa'
});

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || `localhost:${port}`}`);

  if (parsedUrl.pathname.startsWith('/api/')) {
    const match = matchApiRoute(parsedUrl.pathname);
    if (!match) {
      setNotFound(res);
      return;
    }

    try {
      req.query = {
        ...Object.fromEntries(parsedUrl.searchParams.entries()),
        ...match.params
      };
      const moduleUrl = `${pathToFileURL(match.route.filePath).href}?t=${Date.now()}`;
      const mod = await import(moduleUrl);
      await mod.default(req, res);
    } catch (error) {
      if (res.writableEnded) return;
      if (!res.headersSent) {
        res.statusCode = error.statusCode || 500;
        res.setHeader('Content-Type', 'application/json');
      }
      res.end(JSON.stringify({ message: error.message || 'Local API request failed.' }));
    }
    return;
  }

  vite.middlewares(req, res);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Local app with API routes: http://localhost:${port}/`);
});
