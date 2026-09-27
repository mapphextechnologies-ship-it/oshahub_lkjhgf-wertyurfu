(() => {
  const html = document.documentElement;
  const stored = localStorage.getItem('salama-docs-theme');
  if (stored) html.setAttribute('data-theme', stored);
  else if (window.matchMedia('(prefers-color-scheme: light)').matches) html.setAttribute('data-theme', 'light');

  const themeBtn = document.getElementById('themeToggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      html.setAttribute('data-theme', next);
      localStorage.setItem('salama-docs-theme', next);
      if (window.mermaid) {
        // re-render not required; theme vars already applied to containers
      }
    });
  }

  const menuBtn = document.getElementById('menuToggle');
  const overlay = document.getElementById('navOverlay');
  const closeNav = () => document.body.classList.remove('nav-open');
  if (menuBtn) menuBtn.addEventListener('click', () => document.body.classList.toggle('nav-open'));
  if (overlay) overlay.addEventListener('click', closeNav);

  const search = document.getElementById('navSearch');
  if (search) {
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      document.querySelectorAll('.nav a').forEach((a) => {
        const show = !q || a.textContent.toLowerCase().includes(q);
        a.style.display = show ? '' : 'none';
      });
    });
  }

  // TOC
  const toc = document.getElementById('toc');
  const article = document.querySelector('article.doc');
  if (toc && article) {
    const headings = article.querySelectorAll('h2, h3');
    const frag = document.createDocumentFragment();
    const title = document.createElement('strong');
    title.textContent = 'On this page';
    frag.appendChild(title);
    headings.forEach((h) => {
      if (!h.id) {
        h.id = h.textContent.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      }
      const a = document.createElement('a');
      a.href = '#' + h.id;
      a.textContent = h.textContent;
      a.className = h.tagName.toLowerCase();
      frag.appendChild(a);
    });
    toc.appendChild(frag);
  }

  // Copy buttons
  document.querySelectorAll('pre').forEach((pre) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-btn';
    btn.textContent = 'Copy';
    btn.addEventListener('click', async () => {
      const code = pre.querySelector('code');
      const text = code ? code.innerText : pre.innerText;
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = 'Copied';
        setTimeout(() => (btn.textContent = 'Copy'), 1200);
      } catch {
        btn.textContent = 'Failed';
        setTimeout(() => (btn.textContent = 'Copy'), 1200);
      }
    });
    pre.appendChild(btn);
  });

  // Highlight.js
  if (window.hljs) {
    document.querySelectorAll('pre code').forEach((block) => window.hljs.highlightElement(block));
  }

  // Mermaid
  if (window.mermaid) {
    const isDark = html.getAttribute('data-theme') !== 'light';
    mermaid.initialize({
      startOnLoad: true,
      theme: isDark ? 'dark' : 'default',
      securityLevel: 'loose',
      flowchart: { curve: 'basis' },
    });
  }
})();
