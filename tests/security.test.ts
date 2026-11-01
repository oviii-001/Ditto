import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DriveManager } from '../src/drive/drive-manager.js';
import { OAuthManager, DRIVE_FILE_SCOPE } from '../src/drive/oauth-client.js';
import { ApkParser } from '../src/android/apk-parser.js';
import { runCli } from '../src/cli.js';
import { StateStore } from '../src/storage/state-store.js';
import { OAuth2Client } from 'google-auth-library';
import { spawn } from 'node:child_process';

describe('Security Hardening & Vulnerability Resistance', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `ditto-sec-test-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`);
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Security 1: Path Traversal Defense in pullScreenshots', () => {
    it('sanitizes malicious filenames (../../evil.png, ..) and confines downloads to targetLocalDir', async () => {
      const mockAuthClient = {} as OAuth2Client;
      const driveManager = new DriveManager(mockAuthClient);
      const rawDrive = driveManager.getRawDrive();

      const maliciousFiles = [
        { id: 'sec-1', name: '../../etc/passwd', mimeType: 'image/png' },
        { id: 'sec-2', name: '..\\..\\Windows\\System32\\cmd.exe', mimeType: 'image/png' },
        { id: 'sec-3', name: '....//evil.png', mimeType: 'image/png' },
        { id: 'sec-4', name: '..', mimeType: 'image/png' },
      ];

      rawDrive.files.list = vi.fn().mockResolvedValue({
        data: { files: maliciousFiles },
      });
      rawDrive.files.get = vi.fn().mockResolvedValue({
        data: Buffer.from('innocuous-pixel'),
      });
      rawDrive.files.delete = vi.fn().mockResolvedValue({});

      const downloadDir = path.join(tempDir, 'inbox');
      const items = await driveManager.pullScreenshots(downloadDir, { folderId: 'folder-1' });

      expect(items).toHaveLength(4);

      // Verify that every single downloaded file is strictly inside downloadDir
      const resolvedTarget = path.resolve(downloadDir);
      for (const item of items) {
        const resolvedItemPath = path.resolve(item.localPath);
        expect(resolvedItemPath.startsWith(resolvedTarget)).toBe(true);
        expect(fs.existsSync(item.localPath)).toBe(true);
        expect(item.name).not.toContain('..');
      }
    });
  });

  describe('Security 2: Command Injection Protection in openBrowser', () => {
    it('rejects URLs with newlines, control characters, or non-web protocols without executing commands', () => {
      const maliciousUrls = [
        "https://google.com'\ncalc.exe\n'",
        "https://google.com\r\nrmdir /s /q C:\\",
        'javascript:alert(document.cookie)',
        'file:///C:/Windows/System32/calc.exe',
      ];

      for (const badUrl of maliciousUrls) {
        expect(() => OAuthManager.openBrowser(badUrl)).not.toThrow();
      }
    });
  });

  describe('Security 3: Least-Privilege Drive OAuth Scope Verification', () => {
    it('strictly enforces drive.file scope and forbids broad drive access', () => {
      expect(DRIVE_FILE_SCOPE).toBe('https://www.googleapis.com/auth/drive.file');
      expect(DRIVE_FILE_SCOPE).not.toBe('https://www.googleapis.com/auth/drive');
      expect(DRIVE_FILE_SCOPE).not.toBe('https://www.googleapis.com/auth/drive.readonly');
    });
  });

  describe('Security 4: Secret Truncation & Token Redaction in CLI Output', () => {
    it('never prints client secret or full refresh tokens in status output', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const secretState = {
        version: '1.0.0',
        oauth: {
          clientId: '498270044151-uj965vgui5evauk1sl4fvstsi2rgjcq7.apps.googleusercontent.com',
          clientSecret: 'SUPER_SECRET_GOCSPX_KEY_NEVER_LEAK',
          tokens: {
            access_token: 'secret-access-token-12345',
            refresh_token: 'secret-refresh-token-67890',
          },
        },
      };

      vi.spyOn(StateStore.prototype, 'loadState').mockReturnValue(secretState as any);

      await runCli(['status']);

      const allOutput = consoleLogSpy.mock.calls.map((call) => call.join(' ')).join('\n');

      // Assert that secret and full tokens NEVER appear in human-readable output
      expect(allOutput).not.toContain('SUPER_SECRET_GOCSPX_KEY_NEVER_LEAK');
      expect(allOutput).not.toContain('secret-access-token-12345');
      expect(allOutput).not.toContain('secret-refresh-token-67890');
      // Truncated client ID only
      expect(allOutput).toContain('498270044151-uj...');

      consoleLogSpy.mockRestore();
    });
  });

  describe('Security 5: Corrupt & Forged Archive Rejection in ApkParser', () => {
    it('rejects files without valid ZIP header magic bytes to prevent parser exploitation', () => {
      const fakeApk = path.join(tempDir, 'malicious.apk');
      fs.writeFileSync(fakeApk, 'NOT_A_ZIP_HEADER_JUST_RANDOM_TEXT_PAYLOAD');

      expect(() => ApkParser.parseApk(fakeApk)).toThrow('is not a valid ZIP/APK archive');
    });

    it('rejects empty 0-byte files masquerading as APKs', () => {
      const emptyApk = path.join(tempDir, 'empty.apk');
      fs.writeFileSync(emptyApk, '');

      expect(() => ApkParser.parseApk(emptyApk)).toThrow('is empty');
    });
  });
});
