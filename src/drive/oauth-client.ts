import http from 'node:http';
import { AddressInfo } from 'node:net';
import { spawn } from 'node:child_process';
import { OAuth2Client } from 'google-auth-library';
import { OAuthTokens } from '../types/index.js';

export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

// Default OAuth credentials (can be pre-configured for open source releases, or overridden via env vars)
export const DEFAULT_OAUTH_CLIENT_ID = process.env.DITTO_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';
export const DEFAULT_OAUTH_CLIENT_SECRET = process.env.DITTO_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '';

export class OAuthManager {
  /**
   * Run the local loopback OAuth2 flow to authenticate the user and obtain refresh/access tokens.
   */
  public static async authenticate(
    clientId: string,
    clientSecret: string,
    options: { timeoutMs?: number; openBrowser?: boolean } = {}
  ): Promise<OAuthTokens> {
    const timeoutMs = options.timeoutMs || 120000; // 2 minutes timeout
    const shouldOpenBrowser = options.openBrowser !== false;

    return new Promise<OAuthTokens>((resolve, reject) => {
      let oauth2Client: OAuth2Client;
      let server: http.Server;
      let timer: NodeJS.Timeout;

      server = http.createServer(async (req, res) => {
        try {
          if (!req.url || !req.url.startsWith('/oauth2callback')) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
            return;
          }

          const parsedUrl = new URL(req.url, 'http://127.0.0.1');
          const code = parsedUrl.searchParams.get('code');
          const error = parsedUrl.searchParams.get('error');

          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<h2>Authentication Failed</h2><p>${error}</p>`);
            clearTimeout(timer);
            server.close();
            reject(new Error(`OAuth authentication failed: ${error}`));
            return;
          }

          if (!code) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<h2>Missing authorization code</h2>`);
            return;
          }

          const { tokens } = await oauth2Client.getToken(code);

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <!DOCTYPE html>
            <html>
              <head><title>Ditto - Authorization Successful</title></head>
              <body style="font-family: system-ui, sans-serif; text-align: center; padding: 50px;">
                <h1 style="color: #10b981;">Authorization Successful!</h1>
                <p>Google Drive authorization for Ditto is complete.</p>
                <p>You can close this tab and return to your terminal.</p>
              </body>
            </html>
          `);

          clearTimeout(timer);
          server.close();
          resolve(tokens as OAuthTokens);
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal server error during token exchange.');
          clearTimeout(timer);
          server.close();
          reject(err);
        }
      });

      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as AddressInfo;
        const port = address.port;
        const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;

        oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);

        const authUrl = oauth2Client.generateAuthUrl({
          access_type: 'offline',
          prompt: 'consent',
          scope: [DRIVE_FILE_SCOPE],
        });

        console.log('\n🔗 If your browser does not open automatically, visit this URL:');
        console.log(`${authUrl}\n`);

        if (shouldOpenBrowser) {
          OAuthManager.openBrowser(authUrl);
        }

        timer = setTimeout(() => {
          server.close();
          reject(new Error(
            `OAuth authentication timed out after ${timeoutMs / 1000} seconds.\n\n` +
            `Common causes & solutions:\n` +
            `1. Test Users: In Google Cloud Console > "OAuth consent screen", ensure your personal Gmail is added under "Test users".\n` +
            `2. Application Type: In Credentials, ensure your OAuth client type is "Desktop app" (NOT "Web application").\n` +
            `3. Browser: If the browser did not launch automatically, copy and open the authorization URL above.`
          ));
        }, timeoutMs);
      });

      server.on('error', (err) => {
        clearTimeout(timer);
        reject(new Error(`Failed to start local OAuth loopback server: ${err.message}`));
      });
    });
  }

  /**
   * Safely open a URL in the user's default browser across Windows, macOS, and Linux
   * without cmd.exe ampersand/quote corruption.
   */
  public static openBrowser(url: string): void {
    try {
      if (process.platform === 'win32') {
        const ps = spawn(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-Command', `Start-Process '${url.replace(/'/g, "''")}'`],
          { stdio: 'ignore', detached: true }
        );
        ps.unref();
      } else if (process.platform === 'darwin') {
        const child = spawn('open', [url], { stdio: 'ignore', detached: true });
        child.unref();
      } else {
        const child = spawn('xdg-open', [url], { stdio: 'ignore', detached: true });
        child.unref();
      }
    } catch {
      // Best-effort: URL is already printed to terminal
    }
  }

  /**
   * Instantiate an authenticated OAuth2Client instance with automatic token refreshing.
   */
  public static createClient(
    clientId: string,
    clientSecret: string,
    tokens: OAuthTokens,
    onTokenRefreshed?: (updatedTokens: OAuthTokens) => void
  ): OAuth2Client {
    const client = new OAuth2Client(clientId, clientSecret);
    client.setCredentials({
      access_token: tokens.access_token || undefined,
      refresh_token: tokens.refresh_token || undefined,
      scope: tokens.scope || undefined,
      token_type: tokens.token_type || undefined,
      expiry_date: tokens.expiry_date || undefined,
    });

    if (onTokenRefreshed) {
      client.on('tokens', (newTokens) => {
        const merged: OAuthTokens = {
          ...tokens,
          ...newTokens,
        };
        onTokenRefreshed(merged);
      });
    }

    return client;
  }
}
