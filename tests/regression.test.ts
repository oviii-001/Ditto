import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ApkParser } from '../src/android/apk-parser.js';
import { DriveManager, CANONICAL_APK_NAME, DITTO_FOLDER_NAME, BUILDS_FOLDER_NAME, DITTO_APP_TAG } from '../src/drive/drive-manager.js';
import { StateStore } from '../src/storage/state-store.js';
import { OAuth2Client } from 'google-auth-library';

describe('Regression Tests', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `ditto-reg-test-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`);
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Bug Regression 1: Gradle UP-TO-DATE timestamp handling in ApkParser', () => {
    it('successfully recovers existing APK when build was UP-TO-DATE (older than sinceTimeMs)', () => {
      const apkDir = path.join(tempDir, 'app', 'build', 'outputs', 'apk', 'debug');
      fs.mkdirSync(apkDir, { recursive: true });
      const apkPath = path.join(apkDir, 'app-debug.apk');
      fs.writeFileSync(apkPath, 'fake-apk-binary-content');

      // Set mtime to 1 hour ago
      const oldTime = new Date(Date.now() - 3600000);
      fs.utimesSync(apkPath, oldTime, oldTime);

      // Build start time is now (simulating UP-TO-DATE where no file was modified during build)
      const buildStartTime = Date.now();

      const resolved = ApkParser.findApk(tempDir, buildStartTime);
      expect(resolved).toBe(apkPath);
    });
  });

  describe('Bug Regression 2: Legacy root & Ditto folder APK auto-migration', () => {
    it('seamlessly migrates legacy file into Ditto/Builds without altering fileId or links', async () => {
      const mockAuthClient = {} as OAuth2Client;
      const driveManager = new DriveManager(mockAuthClient);
      const rawDrive = driveManager.getRawDrive();

      const mockFilesGet = vi.fn();
      const mockFilesUpdate = vi.fn().mockResolvedValue({ data: { id: 'legacy-apk-1', parents: ['builds-456'] } });
      const mockFilesList = vi.fn();
      const mockFilesCreate = vi.fn();

      rawDrive.files.get = mockFilesGet;
      rawDrive.files.update = mockFilesUpdate;
      rawDrive.files.list = mockFilesList;
      rawDrive.files.create = mockFilesCreate;

      // 1. Parent Ditto folder
      mockFilesGet.mockResolvedValueOnce({
        data: { id: 'ditto-123', name: DITTO_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder', trashed: false },
      });
      // 2. Builds subfolder
      mockFilesGet.mockResolvedValueOnce({
        data: { id: 'builds-456', name: BUILDS_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder', trashed: false },
      });
      // 3. Legacy file located in root (parents: ['root'], not in builds-456)
      mockFilesGet.mockResolvedValueOnce({
        data: {
          id: 'legacy-apk-1',
          name: CANONICAL_APK_NAME,
          trashed: false,
          parents: ['root'],
          webViewLink: 'https://drive.google.com/file/d/legacy-apk-1/view',
          webContentLink: 'https://drive.google.com/uc?id=legacy-apk-1',
          createdTime: '2026-10-01T00:00:00Z',
        },
      });

      const file = await driveManager.getOrCreateCanonicalFile('legacy-apk-1', 'ditto-123', 'builds-456');

      expect(file.fileId).toBe('legacy-apk-1');
      expect(file.folderId).toBe('ditto-123');
      expect(file.buildsFolderId).toBe('builds-456');
      expect(file.webViewLink).toBe('https://drive.google.com/file/d/legacy-apk-1/view');
      // Verify migration moved parents into builds-456
      expect(mockFilesUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          fileId: 'legacy-apk-1',
          addParents: 'builds-456',
        })
      );
    });
  });

  describe('Bug Regression 3: Local collision handling in pullScreenshots', () => {
    it('appends incrementing numerical suffixes to prevent overwriting duplicate filenames', async () => {
      const mockAuthClient = {} as OAuth2Client;
      const driveManager = new DriveManager(mockAuthClient);
      const rawDrive = driveManager.getRawDrive();

      // Create an existing local file
      const localInbox = path.join(tempDir, 'screenshots');
      fs.mkdirSync(localInbox, { recursive: true });
      fs.writeFileSync(path.join(localInbox, 'bug.png'), 'existing-file-1');

      rawDrive.files.list = vi.fn().mockResolvedValue({
        data: {
          files: [
            { id: 'f-1', name: 'bug.png', mimeType: 'image/png', size: '100' },
            { id: 'f-2', name: 'bug.png', mimeType: 'image/png', size: '200' },
          ],
        },
      });

      rawDrive.files.get = vi.fn().mockResolvedValue({
        data: Buffer.from('new-image-content'),
      });
      rawDrive.files.delete = vi.fn().mockResolvedValue({});

      const items = await driveManager.pullScreenshots(localInbox, { folderId: 'folder-1' });

      expect(items).toHaveLength(2);
      expect(items[0].localPath).toBe(path.join(localInbox, 'bug_1.png'));
      expect(items[1].localPath).toBe(path.join(localInbox, 'bug_2.png'));
      expect(fs.existsSync(path.join(localInbox, 'bug.png'))).toBe(true);
      expect(fs.existsSync(path.join(localInbox, 'bug_1.png'))).toBe(true);
      expect(fs.existsSync(path.join(localInbox, 'bug_2.png'))).toBe(true);
    });
  });

  describe('Bug Regression 4: Stale lockfile recovery in StateStore', () => {
    it('automatically recovers and acquires lock when existing lockfile has timed out', async () => {
      const store = new StateStore(tempDir);
      const lockPath = path.join(tempDir, 'lock');

      // Create a stale lock from 70 seconds ago (exceeding the 60s stale threshold)
      fs.mkdirSync(lockPath, { recursive: true });
      const staleTime = new Date(Date.now() - 70000);
      fs.utimesSync(lockPath, staleTime, staleTime);

      let executed = false;
      await store.withLock(async () => {
        executed = true;
      }, 5000);

      expect(executed).toBe(true);
      expect(fs.existsSync(lockPath)).toBe(false);
    });
  });
});
