import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DriveManager, CANONICAL_APK_NAME, DITTO_APP_TAG } from '../src/drive/drive-manager.js';
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

  it('reuses preferred fileId when it exists on Drive and is not trashed', async () => {
    mockFilesGet.mockResolvedValue({
      data: {
        id: 'pref-123',
        name: CANONICAL_APK_NAME,
        trashed: false,
        webViewLink: 'https://drive.google.com/view/pref-123',
        webContentLink: 'https://drive.google.com/download/pref-123',
        createdTime: '2026-10-30T10:00:00Z',
      },
    });

    const file = await driveManager.getOrCreateCanonicalFile('pref-123');
    expect(file.fileId).toBe('pref-123');
    expect(mockFilesGet).toHaveBeenCalledWith(expect.objectContaining({ fileId: 'pref-123' }));
    expect(mockFilesCreate).not.toHaveBeenCalled();
  });

  it('self-heals via appProperties search when preferred file returns 404', async () => {
    mockFilesGet.mockRejectedValue({ code: 404, message: 'Not found' });
    mockFilesList.mockResolvedValue({
      data: {
        files: [
          {
            id: 'discovered-456',
            name: CANONICAL_APK_NAME,
            webViewLink: 'https://drive.google.com/view/discovered-456',
            webContentLink: 'https://drive.google.com/download/discovered-456',
            createdTime: '2026-10-30T11:00:00Z',
          },
        ],
      },
    });
    mockPermissionsCreate.mockResolvedValue({});

    const file = await driveManager.getOrCreateCanonicalFile('broken-file-id');
    expect(file.fileId).toBe('discovered-456');
    expect(mockFilesList).toHaveBeenCalledWith(
      expect.objectContaining({
        q: expect.stringContaining(DITTO_APP_TAG),
      })
    );
    expect(mockFilesCreate).not.toHaveBeenCalled();
    expect(mockPermissionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: 'discovered-456' })
    );
  });

  it('creates canonical file with appProperties and public reader permission when non-existent', async () => {
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

    const file = await driveManager.getOrCreateCanonicalFile();
    expect(file.fileId).toBe('new-canonical-789');
    expect(mockFilesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          name: CANONICAL_APK_NAME,
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
      // Wait a tick for any stream handle to settle before cleanup
      await new Promise((r) => setTimeout(r, 50));
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });
});
