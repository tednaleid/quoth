#!/usr/bin/env -S bun run
/**
 * ABOUTME: Interactive helper that runs the Google OAuth loopback flow and prints a
 * ABOUTME: Chrome Web Store refresh token suitable for the CHROME_REFRESH_TOKEN secret.
 */

const clientId = process.env.CHROME_CLIENT_ID;
const clientSecret = process.env.CHROME_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error('Error: CHROME_CLIENT_ID and CHROME_CLIENT_SECRET must be set.');
  console.error(
    'Create a Desktop-app OAuth client at https://console.cloud.google.com/apis/credentials',
  );
  process.exit(1);
}

const port = 8081;
const redirectUri = `http://127.0.0.1:${port}/callback`;
const scope = 'https://www.googleapis.com/auth/chromewebstore';

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', clientId);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', scope);
authUrl.searchParams.set('redirect_uri', redirectUri);
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('prompt', 'consent');

console.log('\nOpen this URL in a browser signed in as the CWS-owning Google account:\n');
console.log(authUrl.toString());
console.log(`\nListening on ${redirectUri} ...\n`);

const code: string = await new Promise((resolve, reject) => {
  const server = Bun.serve({
    port,
    hostname: '127.0.0.1',
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname !== '/callback') {
        return new Response('Not found', { status: 404 });
      }
      const error = url.searchParams.get('error');
      if (error) {
        setTimeout(() => server.stop(), 100);
        reject(new Error(`OAuth error: ${error}`));
        return new Response(`OAuth error: ${error}`, { status: 400 });
      }
      const c = url.searchParams.get('code');
      if (c) {
        setTimeout(() => server.stop(), 100);
        resolve(c);
        return new Response(
          'Authorization received. You can close this tab and return to the terminal.',
          { status: 200, headers: { 'Content-Type': 'text/plain' } },
        );
      }
      return new Response('Missing code', { status: 400 });
    },
  });
});

console.log('Authorization code received. Exchanging for refresh token...');

const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  }),
});

if (!tokenResp.ok) {
  console.error('Token exchange failed:', tokenResp.status, await tokenResp.text());
  process.exit(1);
}

const tokens = (await tokenResp.json()) as {
  refresh_token?: string;
  access_token?: string;
  error?: string;
};

if (!tokens.refresh_token) {
  console.error('No refresh_token in response.');
  console.error(
    'If this client was previously authorized, revoke it at https://myaccount.google.com/permissions and rerun.',
  );
  console.error('Full response:', tokens);
  process.exit(1);
}

console.log('\nSuccess. Refresh token:\n');
console.log(tokens.refresh_token);
console.log('\nExport it for the next step:\n');
console.log(`export CHROME_REFRESH_TOKEN="${tokens.refresh_token}"`);
console.log('\nThen push all four secrets with: just setup-chrome-secrets\n');
