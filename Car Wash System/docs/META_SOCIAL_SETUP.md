# Meta social connection setup

The booking link works independently of Facebook or Instagram. The Meta connection uses a Supabase Edge Function; no access token is sent to the browser.

## Supabase Function secrets

Set these secrets for the Supabase project:

- `APP_ORIGIN`: the HTTPS origin hosting OshaHub, without a trailing slash.
- `META_APP_ID` and `META_APP_SECRET`: credentials for the Meta Developer app.
- `META_GRAPH_API_VERSION`: a supported Graph API version such as `v25.0`; use a version currently enabled for the Meta app.
- `META_REDIRECT_URI`: `https://<project-ref>.supabase.co/functions/v1/meta-social-connect`.
- `SOCIAL_TOKEN_ENCRYPTION_KEY`: base64 encoding of 32 random bytes. Generate with `openssl rand -base64 32`; keep a secure backup because changing it makes saved tokens unreadable.

Deploy `meta-social-connect` and add the redirect URI to the Meta app's valid OAuth redirect URIs. Enable Facebook Login for Web and request `pages_show_list`; Instagram connections also request `instagram_basic`. Instagram must be a professional account linked to a Facebook Page the authorizing account manages. Meta may require app review/advanced access before businesses outside the app's developer/test roles can connect.

If Meta returns multiple eligible Pages/accounts, the administrator chooses the intended account in OshaHub before it is saved as connected. This integration records the connection and booking URL; it does not publish posts or edit profile links because those actions require additional permissions and provider approval.

The OAuth function has no gateway JWT requirement because Meta calls its callback without a user session. It validates the user JWT for start/disconnect operations, checks active business-admin membership, consumes short-lived one-time OAuth state, and encrypts Page tokens with AES-GCM before storing them.
