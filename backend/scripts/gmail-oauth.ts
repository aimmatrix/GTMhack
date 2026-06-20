/**
 * One-time CLI to obtain a Gmail OAuth refresh token for draft creation.
 *
 * Usage:
 *   GMAIL_CLIENT_ID=... GMAIL_CLIENT_SECRET=... npx tsx scripts/gmail-oauth.ts
 *
 * Prerequisites: OAuth "Desktop app" or "Web application" client in Google Cloud
 * with redirect URI http://localhost:8788/oauth2callback
 */
import 'dotenv/config';
import * as http from 'node:http';
import { URL } from 'node:url';
import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/gmail.compose'];
const REDIRECT_URI = 'http://localhost:8788/oauth2callback';
const PORT = 8788;

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Missing ${name}. Set it in .env or export it before running this script.`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const clientId = requireEnv('GMAIL_CLIENT_ID');
  const clientSecret = requireEnv('GMAIL_CLIENT_SECRET');

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });

  console.log('\nGmail OAuth — one-time refresh token setup\n');
  console.log('1. Open this URL in your browser and sign in with the Gmail account');
  console.log('   that should own drafts (your test/demo account):\n');
  console.log(authUrl);
  console.log('\n2. Approve access. Your browser will redirect to localhost.');
  console.log('   This script listens on port', PORT, 'and captures the code automatically.\n');

  const code = await waitForAuthCode();
  const { tokens } = await oauth2.getToken(code);

  if (!tokens.refresh_token) {
    console.error(
      '\nNo refresh_token returned. Revoke app access at https://myaccount.google.com/permissions',
    );
    console.error('and re-run with prompt=consent (this script already does).');
    process.exit(1);
  }

  console.log('\nSuccess! Add these to backend/.env:\n');
  console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
  if (tokens.scope) console.log(`# scopes: ${tokens.scope}`);
  console.log('\nAlso set GMAIL_SENDER to the Gmail address you authorized.');
  console.log('Then restart the backend — HANDOFF_MODE=auto will use gmail_api.\n');
}

function waitForAuthCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url || '/', `http://localhost:${PORT}`);
        if (url.pathname !== '/oauth2callback') {
          res.writeHead(404);
          res.end('Not found');
          return;
        }

        const err = url.searchParams.get('error');
        if (err) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end(`Authorization failed: ${err}`);
          server.close();
          reject(new Error(err));
          return;
        }

        const code = url.searchParams.get('code');
        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Missing code parameter');
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          '<html><body><h2>Authorization complete</h2><p>You can close this tab and return to the terminal.</p></body></html>',
        );
        server.close();
        resolve(code);
      } catch (e) {
        server.close();
        reject(e);
      }
    });

    server.on('error', reject);
    server.listen(PORT, () => {
      // ready
    });
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
