import http from 'node:http';
import { AddressInfo } from 'node:net';
import { exec } from 'node:child_process';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { OAuthTokens } from '../types/index.js';

export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

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

        oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

        const authUrl = oauth2Client.generateAuthUrl({
          access_type: 'offline',
          prompt: 'consent',
          scope: [DRIVE_FILE_SCOPE],
        });

        if (shouldOpenBrowser) {
          const openCmd =
            process.platform === 'win32'
              ? `start "" "${authUrl}"`
              : process.platform === 'darwin'
              ? `open "${authUrl}"`
              : `xdg-open "${authUrl}"`;

          exec(openCmd, (err) => {
            if (err) {
              console.error(`Please open this URL in your browser:\n${authUrl}`);
            }
          });
        }

        timer = setTimeout(() => {
          server.close();
          reject(new Error(`OAuth authentication timed out after ${timeoutMs / 1000} seconds.`));
        }, timeoutMs);
      });

      server.on('error', (err) => {
        clearTimeout(timer);
        reject(new Error(`Failed to start local OAuth loopback server: ${err.message}`));
      });
    });
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
    const client = new google.auth.OAuth2(clientId, clientSecret);
    client.setCredentials(tokens);

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
