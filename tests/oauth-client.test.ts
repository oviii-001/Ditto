import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import { OAuthManager, DRIVE_FILE_SCOPE } from '../src/drive/oauth-client.js';
import { OAuthTokens } from '../src/types/index.js';

describe('OAuthManager', () => {
  describe('createClient', () => {
    it('initializes OAuth2Client with tokens correctly', () => {
      const mockTokens: OAuthTokens = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        scope: DRIVE_FILE_SCOPE,
        expiry_date: 1234567890,
      };

      const client = OAuthManager.createClient('test-client-id', 'test-client-secret', mockTokens);

      expect(client).toBeDefined();
      expect(client.credentials.access_token).toBe('test-access-token');
      expect(client.credentials.refresh_token).toBe('test-refresh-token');
      expect(client.credentials.scope).toBe(DRIVE_FILE_SCOPE);
    });

    it('triggers onTokenRefreshed callback when tokens event fires', () => {
      const initialTokens: OAuthTokens = {
        access_token: 'initial-access-token',
        refresh_token: 'initial-refresh-token',
      };

      let refreshedResult: OAuthTokens | null = null;
      const onRefreshed = (updated: OAuthTokens) => {
        refreshedResult = updated;
      };

      const client = OAuthManager.createClient('client-id', 'client-secret', initialTokens, onRefreshed);

      // Simulate token refresh event on the client
      client.emit('tokens', {
        access_token: 'new-access-token',
        expiry_date: 999999,
      });

      expect(refreshedResult).not.toBeNull();
      expect(refreshedResult?.access_token).toBe('new-access-token');
      expect(refreshedResult?.refresh_token).toBe('initial-refresh-token');
      expect(refreshedResult?.expiry_date).toBe(999999);
    });
  });

  describe('openBrowser', () => {
    it('executes without throwing across platforms', () => {
      expect(() => OAuthManager.openBrowser('https://accounts.google.com/test')).not.toThrow();
    });
  });

  describe('authenticate (Loopback Flow)', () => {
    it('serves 404 for non-callback paths and handles error query params', async () => {
      let serverPort = '';
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation((msg) => {
        if (typeof msg === 'string') {
          const match = decodeURIComponent(msg).match(/http:\/\/127\.0\.0\.1:(\d+)/);
          if (match) serverPort = match[1];
        }
      });

      const authPromise = OAuthManager.authenticate('mock-id', 'mock-secret', {
        timeoutMs: 3000,
        openBrowser: false,
      });
      // Attach rejection handler immediately to prevent unhandled rejection warning
      const rejectionExpectation = expect(authPromise).rejects.toThrow('OAuth authentication failed: access_denied');

      // Wait for server to start and port to be resolved
      while (!serverPort) {
        await new Promise((r) => setTimeout(r, 10));
      }

      // 1. Send GET to /random-path -> should respond 404
      const res404 = await new Promise<{ statusCode?: number; data: string }>((resolve) => {
        http.get(`http://127.0.0.1:${serverPort}/random`, (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => resolve({ statusCode: res.statusCode, data }));
        });
      });
      expect(res404.statusCode).toBe(404);

      // 2. Send GET with error param -> triggers rejection
      const resErr = await new Promise<{ statusCode?: number; data: string }>((resolve) => {
        http.get(`http://127.0.0.1:${serverPort}/oauth2callback?error=access_denied`, (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => resolve({ statusCode: res.statusCode, data }));
        });
      });
      expect(resErr.statusCode).toBe(400);

      await rejectionExpectation;
      consoleSpy.mockRestore();
    });

    it('rejects with timeout error when no callback is received', async () => {
      await expect(
        OAuthManager.authenticate('test-id', 'test-secret', {
          timeoutMs: 50, // rapid timeout
          openBrowser: false,
        })
      ).rejects.toThrow(/timed out/);
    });
  });
});
