import { readJson, sendJson, sendOptions } from '../../_lib/http.js';
import { getSupabase, requirePortalUser } from '../../_lib/supabase.js';
import { normalizeWebsiteContent } from '../../_lib/site-content.js';

const VALID_SECTIONS = new Set(['admin', 'access', 'security', 'reminders', 'finance', 'messages', 'website']);

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    sendOptions(res, 'GET,PUT,OPTIONS');
    return;
  }

  if (!['GET', 'PUT'].includes(req.method)) {
    res.setHeader('Allow', 'GET,PUT');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    const user = await requirePortalUser(req, ['admin']);
    const section = String(req.query?.section || '').trim();

    if (!VALID_SECTIONS.has(section)) {
      sendJson(res, 400, { message: 'Choose a valid settings section.' });
      return;
    }

    if (req.method === 'GET') {
      const { data, error } = await getSupabase()
        .from('system_settings')
        .select('section,settings_json,saved_at,updated_at')
        .eq('section', section)
        .maybeSingle();

      if (error) throw error;
      const values = section === 'website'
        ? normalizeWebsiteContent(data?.settings_json || {})
        : (data?.settings_json ?? null);
      sendJson(res, 200, {
        setting: data
          ? {
              section: data.section,
              values,
              saved_at: data.saved_at,
              updated_at: data.updated_at
            }
          : { section, values: null }
      });
      return;
    }

    const body = await readJson(req);
    const values = body.values && typeof body.values === 'object' && !Array.isArray(body.values)
      ? body.values
      : null;

    if (!values) {
      sendJson(res, 400, { message: 'Settings values must be an object.' });
      return;
    }

    const normalizedValues = section === 'website'
      ? normalizeWebsiteContent(values)
      : values;

    const payload = {
      section,
      settings_json: normalizedValues,
      saved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: user.email || null
    };

    const { data, error } = await getSupabase()
      .from('system_settings')
      .upsert(payload, { onConflict: 'section' })
      .select('section,settings_json,saved_at,updated_at,updated_by')
      .single();

    if (error) throw error;
    sendJson(res, 200, {
      setting: {
        section: data.section,
        values: data.settings_json ?? null,
        saved_at: data.saved_at,
        updated_at: data.updated_at,
        updated_by: data.updated_by ?? null
      }
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
