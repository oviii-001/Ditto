import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DriveManager, CANONICAL_APK_NAME, DITTO_FOLDER_NAME, DITTO_APP_TAG } from '../src/drive/drive-manager.js';
import { OAuth2Client } from 'google-auth-library';

describe('DriveManager', () => {
  let mockAuthClient: OAuth2Client;
  let mockFilesGet: any;
  let mockFilesList: any;
  let mockFilesCreate: any;
  let mockFilesUpdate: any;
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
    mockPermissionsCreate = vi.fn();

    rawDrive.files.get = mockFilesGet;
    rawDrive.files.list = mockFilesList;
    rawDrive.files.create = mockFilesCreate;
    rawDrive.files.update = mockFilesUpdate;
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
});
