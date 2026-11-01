import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  DriveManager,
  CANONICAL_APK_NAME,
  DITTO_FOLDER_NAME,
  SCREENSHOTS_FOLDER_NAME,
  DITTO_APP_TAG,
  DITTO_SCREENSHOTS_TAG,
} from '../src/drive/drive-manager.js';
import { OAuth2Client } from 'google-auth-library';

describe('DriveManager', () => {
  let mockAuthClient: OAuth2Client;
  let mockFilesGet: any;
  let mockFilesList: any;
  let mockFilesCreate: any;
  let mockFilesUpdate: any;
  let mockFilesDelete: any;
  let mockPermissionsCreate: any;
  let driveManager: DriveManager;

  beforeEach(() => {
    mockAuthClient = {} as OAuth2Client;
    driveManager = new DriveManager(mockAuthClient);

    const rawDrive = driveManager.getRawDrive();

    mockFilesGet = vi.fn();
    mockFilesList = vi.fn();
    mockFilesCreate = vi.fn();
    mockFilesUpdate = vi.fn();
    mockFilesDelete = vi.fn().mockResolvedValue({});
    mockPermissionsCreate = vi.fn();

    rawDrive.files.get = mockFilesGet;
    rawDrive.files.list = mockFilesList;
    rawDrive.files.create = mockFilesCreate;
    rawDrive.files.update = mockFilesUpdate;
    rawDrive.files.delete = mockFilesDelete;
    rawDrive.permissions.create = mockPermissionsCreate;
  });

  describe('getOrCreateDittoFolder', () => {
    it('reuses preferred folderId when it exists and is a folder', async () => {
      mockFilesGet.mockResolvedValue({
        data: {
          id: 'folder-pref-1',
          name: DITTO_FOLDER_NAME,
          mimeType: 'application/vnd.google-apps.folder',
          trashed: false,
        },
      });

      const folderId = await driveManager.getOrCreateDittoFolder('folder-pref-1');
      expect(folderId).toBe('folder-pref-1');
      expect(mockFilesGet).toHaveBeenCalledWith(expect.objectContaining({ fileId: 'folder-pref-1' }));
    });

    it('creates fresh Ditto folder when none exists', async () => {
      mockFilesList.mockResolvedValue({ data: { files: [] } });
      mockFilesCreate.mockResolvedValue({
        data: {
          id: 'new-folder-123',
        },
      });

      const folderId = await driveManager.getOrCreateDittoFolder();
      expect(folderId).toBe('new-folder-123');
      expect(mockFilesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            name: DITTO_FOLDER_NAME,
            mimeType: 'application/vnd.google-apps.folder',
          }),
        })
      );
    });
  });

  describe('getOrCreateCanonicalFile', () => {
    it('reuses preferred fileId, migrates it into Ditto folder if not already inside', async () => {
      // Mock folder get
      mockFilesGet
        .mockResolvedValueOnce({
          data: {
            id: 'folder-123',
            name: DITTO_FOLDER_NAME,
            mimeType: 'application/vnd.google-apps.folder',
            trashed: false,
          },
        })
        // Mock file get (in root, not in folder-123)
        .mockResolvedValueOnce({
          data: {
            id: 'pref-123',
            name: CANONICAL_APK_NAME,
            trashed: false,
            parents: ['root'],
            webViewLink: 'https://drive.google.com/view/pref-123',
            webContentLink: 'https://drive.google.com/download/pref-123',
            createdTime: '2026-10-30T10:00:00Z',
          },
        });

      mockFilesUpdate.mockResolvedValue({ data: { id: 'pref-123', parents: ['folder-123'] } });

      const file = await driveManager.getOrCreateCanonicalFile('pref-123', 'folder-123');
      expect(file.fileId).toBe('pref-123');
      expect(file.folderId).toBe('folder-123');
      // Should have migrated into folder
      expect(mockFilesUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          fileId: 'pref-123',
          addParents: 'folder-123',
        })
      );
    });

    it('does not re-move file if it is already inside the Ditto folder', async () => {
      mockFilesGet
        .mockResolvedValueOnce({
          data: {
            id: 'folder-123',
            name: DITTO_FOLDER_NAME,
            mimeType: 'application/vnd.google-apps.folder',
            trashed: false,
          },
        })
        .mockResolvedValueOnce({
          data: {
            id: 'pref-123',
            name: CANONICAL_APK_NAME,
            trashed: false,
            parents: ['folder-123'],
            webViewLink: 'https://drive.google.com/view/pref-123',
            webContentLink: 'https://drive.google.com/download/pref-123',
            createdTime: '2026-10-30T10:00:00Z',
          },
        });

      const file = await driveManager.getOrCreateCanonicalFile('pref-123', 'folder-123');
      expect(file.fileId).toBe('pref-123');
      expect(file.folderId).toBe('folder-123');
      expect(mockFilesUpdate).not.toHaveBeenCalled();
    });

    it('self-heals via appProperties search when preferred file returns 404', async () => {
      // Mock folder
      mockFilesGet
        .mockResolvedValueOnce({
          data: {
            id: 'folder-123',
            mimeType: 'application/vnd.google-apps.folder',
            trashed: false,
          },
        })
        // Mock file get returns 404
        .mockRejectedValueOnce({ code: 404, message: 'Not found' });

      // Mock file list recovery
      mockFilesList.mockResolvedValue({
        data: {
          files: [
            {
              id: 'discovered-456',
              name: CANONICAL_APK_NAME,
              parents: ['folder-123'],
              webViewLink: 'https://drive.google.com/view/discovered-456',
              webContentLink: 'https://drive.google.com/download/discovered-456',
              createdTime: '2026-10-30T11:00:00Z',
            },
          ],
        },
      });
      mockPermissionsCreate.mockResolvedValue({});

      const file = await driveManager.getOrCreateCanonicalFile('broken-file-id', 'folder-123');
      expect(file.fileId).toBe('discovered-456');
      expect(file.folderId).toBe('folder-123');
      expect(mockPermissionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ fileId: 'discovered-456' })
      );
    });

    it('creates canonical file inside the Ditto folder with public reader permission when non-existent', async () => {
      // Folder lookup
      mockFilesGet.mockResolvedValueOnce({
        data: {
          id: 'folder-123',
          mimeType: 'application/vnd.google-apps.folder',
          trashed: false,
        },
      });

      mockFilesList.mockResolvedValue({ data: { files: [] } });
      mockFilesCreate.mockResolvedValue({
        data: {
          id: 'new-canonical-789',
          name: CANONICAL_APK_NAME,
          webViewLink: 'https://drive.google.com/view/new-canonical-789',
          webContentLink: 'https://drive.google.com/download/new-canonical-789',
          createdTime: '2026-10-30T12:00:00Z',
        },
      });
      mockPermissionsCreate.mockResolvedValue({});

      const file = await driveManager.getOrCreateCanonicalFile(undefined, 'folder-123');
      expect(file.fileId).toBe('new-canonical-789');
      expect(file.folderId).toBe('folder-123');
      expect(mockFilesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            name: CANONICAL_APK_NAME,
            parents: ['folder-123'],
            appProperties: { app: DITTO_APP_TAG, role: 'canonical-apk' },
          }),
        })
      );
      expect(mockPermissionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          fileId: 'new-canonical-789',
          requestBody: { role: 'reader', type: 'anyone' },
        })
      );
    });
  });

  describe('uploadApk', () => {
    it('updates existing file in place on uploadApk', async () => {
      const tempFile = path.join(os.tmpdir(), `test-upload-${Date.now()}.apk`);
      fs.writeFileSync(tempFile, 'fake-apk-binary-content');

      mockFilesUpdate.mockResolvedValue({
        data: {
          id: 'canonical-789',
          name: CANONICAL_APK_NAME,
          webViewLink: 'https://drive.google.com/view/canonical-789',
          webContentLink: 'https://drive.google.com/download/canonical-789',
        },
      });

      try {
        const result = await driveManager.uploadApk('canonical-789', tempFile);
        expect(result.webViewLink).toBe('https://drive.google.com/view/canonical-789');
        expect(mockFilesUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            fileId: 'canonical-789',
            media: expect.objectContaining({
              mimeType: 'application/vnd.android.package-archive',
            }),
          })
        );
        await new Promise((r) => setTimeout(r, 50));
      } finally {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      }
    });
  });

  describe('getOrCreateScreenshotsFolder', () => {
    it('reuses preferred folderId when it exists and is a folder', async () => {
      // Mock parent folder get
      mockFilesGet
        .mockResolvedValueOnce({
          data: {
            id: 'ditto-folder-1',
            name: DITTO_FOLDER_NAME,
            mimeType: 'application/vnd.google-apps.folder',
            trashed: false,
          },
        })
        // Mock screenshots folder get
        .mockResolvedValueOnce({
          data: {
            id: 'ss-pref-1',
            name: SCREENSHOTS_FOLDER_NAME,
            mimeType: 'application/vnd.google-apps.folder',
            trashed: false,
          },
        });

      const folderId = await driveManager.getOrCreateScreenshotsFolder('ss-pref-1', 'ditto-folder-1');
      expect(folderId).toBe('ss-pref-1');
    });

    it('creates fresh Screenshots subfolder inside Ditto folder when none exists', async () => {
      mockFilesGet.mockResolvedValueOnce({
        data: {
          id: 'ditto-folder-1',
          name: DITTO_FOLDER_NAME,
          mimeType: 'application/vnd.google-apps.folder',
          trashed: false,
        },
      });
      mockFilesList.mockResolvedValue({ data: { files: [] } });
      mockFilesCreate.mockResolvedValue({ data: { id: 'new-ss-folder-999' } });

      const folderId = await driveManager.getOrCreateScreenshotsFolder(undefined, 'ditto-folder-1');
      expect(folderId).toBe('new-ss-folder-999');
      expect(mockFilesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            name: SCREENSHOTS_FOLDER_NAME,
            mimeType: 'application/vnd.google-apps.folder',
            parents: ['ditto-folder-1'],
            appProperties: { app: DITTO_APP_TAG, role: DITTO_SCREENSHOTS_TAG },
          }),
        })
      );
    });
  });

  describe('pullScreenshots & purgeScreenshots (Inbox Zero)', () => {
    let localTempDir: string;

    beforeEach(() => {
      localTempDir = path.join(os.tmpdir(), `ditto-test-ss-${Date.now()}`);
      fs.mkdirSync(localTempDir, { recursive: true });
    });

    afterEach(() => {
      if (fs.existsSync(localTempDir)) {
        fs.rmSync(localTempDir, { recursive: true, force: true });
      }
    });

    it('downloads remote screenshots locally and immediately hard-deletes remote files from Drive', async () => {
      mockFilesList.mockResolvedValue({
        data: {
          files: [
            {
              id: 'remote-ss-1',
              name: 'bug_1.png',
              mimeType: 'image/png',
              size: '1024',
              createdTime: '2026-11-01T12:00:00Z',
            },
            {
              id: 'remote-ss-2',
              name: 'bug_2.png',
              mimeType: 'image/png',
              size: '2048',
              createdTime: '2026-11-01T12:01:00Z',
            },
          ],
        },
      });

      mockFilesGet.mockResolvedValue({
        data: Buffer.from('fake-png-binary-stream-data'),
      });

      const items = await driveManager.pullScreenshots(localTempDir, { folderId: 'ss-folder-1' });

      expect(items).toHaveLength(2);
      expect(items[0].name).toBe('bug_1.png');
      expect(fs.existsSync(items[0].localPath)).toBe(true);
      expect(fs.existsSync(items[1].localPath)).toBe(true);

      // Verify immediate remote deletion for Inbox Zero
      expect(mockFilesDelete).toHaveBeenCalledTimes(2);
      expect(mockFilesDelete).toHaveBeenCalledWith({ fileId: 'remote-ss-1' });
      expect(mockFilesDelete).toHaveBeenCalledWith({ fileId: 'remote-ss-2' });
    });

    it('returns empty array when no files are waiting in Drive inbox', async () => {
      mockFilesList.mockResolvedValue({ data: { files: [] } });

      const items = await driveManager.pullScreenshots(localTempDir, { folderId: 'ss-folder-1' });
      expect(items).toEqual([]);
      expect(mockFilesDelete).not.toHaveBeenCalled();
    });

    it('purges all remote files during pre-build sweep', async () => {
      // Mock screenshots folder resolution
      mockFilesGet.mockResolvedValueOnce({
        data: {
          id: 'ditto-folder-1',
          name: DITTO_FOLDER_NAME,
          mimeType: 'application/vnd.google-apps.folder',
          trashed: false,
        },
      });
      mockFilesList
        // list for getOrCreateScreenshotsFolder
        .mockResolvedValueOnce({
          data: { files: [{ id: 'ss-folder-1' }] },
        })
        // list for purgeScreenshots
        .mockResolvedValueOnce({
          data: {
            files: [{ id: 'stale-1' }, { id: 'stale-2' }, { id: 'stale-3' }],
          },
        });

      const purgedCount = await driveManager.purgeScreenshots('ss-folder-1');
      expect(purgedCount).toBe(3);
      expect(mockFilesDelete).toHaveBeenCalledTimes(3);
    });
  });
});
