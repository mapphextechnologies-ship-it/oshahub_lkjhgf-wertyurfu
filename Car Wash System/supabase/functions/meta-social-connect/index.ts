import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const projectUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const appOrigin = (Deno.env.get('APP_ORIGIN') || '').replace(/\/$/, '');
const admin = createClient(projectUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const headers = {
  'Access-Control-Allow-Origin': appOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Vary': 'Origin',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
const redirect = (result: string) => Response.redirect(`${appOrigin}/business.html?social_result=${encodeURIComponent(result)}#/`, 303);
const encoder = new TextEncoder();
const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
async function digest(value: string) { return toB64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))); }
async function encryptToken(token: string) {
  const keyValue = Deno.env.get('SOCIAL_TOKEN_ENCRYPTION_KEY') || '';
  const raw = fromB64(keyValue);
  if (raw.length !== 32) throw new Error('Social token encryption is not configured.');
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(token));
  return { token_ciphertext: toB64(new Uint8Array(encrypted)), token_iv: toB64(iv) };
}
function metaConfig() {
  const appId = Deno.env.get('META_APP_ID') || '';
  const appSecret = Deno.env.get('META_APP_SECRET') || '';
  const graphVersion = Deno.env.get('META_GRAPH_API_VERSION') || '';
  const redirectUri = Deno.env.get('META_REDIRECT_URI') || `${projectUrl}/functions/v1/meta-social-connect`;
  if (!appId || !appSecret || !/^v\d+\.\d+$/.test(graphVersion)) throw new Error('Meta connection is not configured. Add META_APP_ID, META_APP_SECRET and META_GRAPH_API_VERSION to Supabase Functions.');
  if (!appOrigin.startsWith('https://') || !redirectUri.startsWith('https://')) throw new Error('Set APP_ORIGIN and META_REDIRECT_URI to HTTPS URLs.');
  return { appId, appSecret, graphVersion, redirectUri };
}
async function currentAdmin(request: Request, tenantId: string) {
  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) throw new Error('Sign in as a business administrator first.');
  const client = createClient(projectUrl, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new Error('Your sign-in has expired. Sign in again.');
  const { data: membership } = await admin.from('carwash_memberships').select('id').eq('user_id', user.id).eq('tenant_id', tenantId).eq('role', 'BUSINESS_ADMIN').eq('status', 'ACTIVE').maybeSingle();
  if (!membership) throw new Error('Active business administrator access is required.');
  return user;
}
async function handleCallback(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';
  if (!state || !code || url.searchParams.has('error')) return redirect('failed');
  const stateHash = await digest(state);
  const { data: stateRow } = await admin.from('carwash_social_oauth_states').select('*').eq('state_hash', stateHash).gt('expires_at', new Date().toISOString()).maybeSingle();
  if (!stateRow) return redirect('expired');
  await admin.from('carwash_social_oauth_states').delete().eq('state_hash', stateHash);
  try {
    const { appId, appSecret, graphVersion, redirectUri } = metaConfig();
    const tokenUrl = new URL(`https://graph.facebook.com/${graphVersion}/oauth/access_token`);
    tokenUrl.search = new URLSearchParams({ client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code }).toString();
    const shortTokenResponse = await fetch(tokenUrl);
    const shortToken = await shortTokenResponse.json();
    if (!shortTokenResponse.ok || !shortToken.access_token) throw new Error('Meta did not return an access token.');
    const longUrl = new URL(`https://graph.facebook.com/${graphVersion}/oauth/access_token`);
    longUrl.search = new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret, fb_exchange_token: shortToken.access_token }).toString();
    const longResponse = await fetch(longUrl);
    const longToken = await longResponse.json();
    const userToken = longResponse.ok && longToken.access_token ? longToken : shortToken;
    const pagesUrl = new URL(`https://graph.facebook.com/${graphVersion}/me/accounts`);
    pagesUrl.search = new URLSearchParams({ fields: 'id,name,access_token,instagram_business_account{id,username}', access_token: userToken.access_token }).toString();
    const pagesResponse = await fetch(pagesUrl);
    const pagesPayload = await pagesResponse.json();
    if (!pagesResponse.ok || !Array.isArray(pagesPayload.data)) throw new Error('Could not verify the Facebook Pages authorized for this account.');
    const eligible = pagesPayload.data.filter((page: any) => page?.id && page?.access_token && (stateRow.platform === 'FACEBOOK' || page.instagram_business_account?.id));
    if (!eligible.length) throw new Error(stateRow.platform === 'INSTAGRAM' ? 'Connect an Instagram professional account to a Facebook Page you manage, then try again.' : 'No Facebook Page managed by this account was returned.');
    const expiresAt = userToken.expires_in ? new Date(Date.now() + Number(userToken.expires_in) * 1000).toISOString() : null;
    await admin.from('carwash_social_pending_accounts').delete().eq('tenant_id', stateRow.tenant_id).eq('platform', stateRow.platform).eq('user_id', stateRow.user_id);
    const pendingAccounts = await Promise.all(eligible.map(async (page: any) => {
      const token = await encryptToken(page.access_token);
      const accountId = stateRow.platform === 'INSTAGRAM' ? page.instagram_business_account.id : page.id;
      const accountName = stateRow.platform === 'INSTAGRAM' ? `@${page.instagram_business_account.username || page.name}` : page.name;
      return { tenant_id: stateRow.tenant_id, user_id: stateRow.user_id, platform: stateRow.platform, account_id: accountId, account_name: accountName, ...token, expires_at: expiresAt, selection_expires_at: new Date(Date.now() + 10 * 60_000).toISOString() };
    }));
    const { error: pendingError } = await admin.from('carwash_social_pending_accounts').insert(pendingAccounts);
    if (pendingError) throw pendingError;
    return redirect('choose_account');
  } catch (error) {
    console.error('Meta OAuth callback failed:', error);
    return redirect(error instanceof Error && error.message.includes('Instagram professional') ? 'instagram_page_required' : 'failed');
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (new URL(request.url).searchParams.has('code') || new URL(request.url).searchParams.has('error')) return handleCallback(request);
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  try {
    const body = await request.json();
    const action = String(body.action || '');
    const tenantId = String(body.tenantId || '');
    const platform = String(body.platform || '').toUpperCase();
    const user = await currentAdmin(request, tenantId);
    if (!/^[0-9a-f-]{36}$/i.test(tenantId) || !['FACEBOOK', 'INSTAGRAM'].includes(platform)) return json({ error: 'Choose a supported social account.' }, 400);
    if (action === 'disconnect') {
      const { error } = await admin.from('carwash_social_connections').delete().eq('tenant_id', tenantId).eq('platform', platform);
      if (error) throw error;
      await admin.from('carwash_audit_logs').insert({ tenant_id: tenantId, actor_user_id: user.id, action: 'SOCIAL_ACCOUNT_DISCONNECTED', entity_type: 'SOCIAL_ACCOUNT', details: { platform } });
      return json({ ok: true });
    }
    if (action !== 'start') return json({ error: 'Choose a supported connection action.' }, 400);
    const { appId, graphVersion, redirectUri } = metaConfig();
    const state = toB64(crypto.getRandomValues(new Uint8Array(32))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
    const { error: stateError } = await admin.from('carwash_social_oauth_states').insert({ state_hash: await digest(state), tenant_id: tenantId, user_id: user.id, platform, expires_at: new Date(Date.now() + 10 * 60_000).toISOString() });
    if (stateError) throw stateError;
    const authorization = new URL(`https://www.facebook.com/${graphVersion}/dialog/oauth`);
    authorization.search = new URLSearchParams({ client_id: appId, redirect_uri: redirectUri, state, response_type: 'code', scope: platform === 'INSTAGRAM' ? 'pages_show_list,pages_read_engagement,instagram_basic' : 'pages_show_list' }).toString();
    return json({ authorizationUrl: authorization.toString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Social connection could not be started.';
    return json({ error: message }, 400);
  }
});
