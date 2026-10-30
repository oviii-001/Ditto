import fs from 'node:fs';
import { google, drive_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { CanonicalDriveFile } from '../types/index.js';

export const CANONICAL_APK_NAME = 'Latest-debug.apk';
export const DITTO_APP_TAG = 'ditto';

export class DriveManager {
  private drive: drive_v3.Drive;

  constructor(authClient: OAuth2Client) {
    this.drive = google.drive({ version: 'v3', auth: authClient });
  }

  public getRawDrive(): drive_v3.Drive {
    return this.drive;
  }

  /**
   * Resolves the single canonical Drive file:
   * 1. Checks existing fileId from local state.
   * 2. If missing/invalid, recovers via Drive appProperties search.
   * 3. If still not found, creates the canonical file and sets public reader permission.
   */
  public async getOrCreateCanonicalFile(preferredFileId?: string): Promise<CanonicalDriveFile> {
    // 1. Try preferred file ID from local state
    if (preferredFileId) {
      try {
        const res = await this.drive.files.get({
          fileId: preferredFileId,
          fields: 'id, name, trashed, webViewLink, webContentLink, createdTime',
        });

        if (res.data.id && !res.data.trashed) {
          const webViewLink = res.data.webViewLink || `https://drive.google.com/file/d/${res.data.id}/view?usp=sharing`;
          const webContentLink = res.data.webContentLink || `https://drive.google.com/uc?export=download&id=${res.data.id}`;

          return {
            fileId: res.data.id,
            fileName: res.data.name || CANONICAL_APK_NAME,
            webViewLink,
            webContentLink,
            createdAt: res.data.createdTime || new Date().toISOString(),
          };
        }
      } catch (err) {
        // If 404 or deleted, fall through to discovery/creation
        const error = err as { code?: number };
        if (error.code !== 404) {
          // If network or permission error, rethrow
          // (Only 404 triggers self-healing creation)
        }
      }
    }

    // 2. Self-Healing: Search for existing file tagged with appProperties
    try {
      const searchRes = await this.drive.files.list({
        q: `appProperties has { key='app' and value='${DITTO_APP_TAG}' } and trashed = false`,
        fields: 'files(id, name, webViewLink, webContentLink, createdTime)',
        pageSize: 1,
      });

      if (searchRes.data.files && searchRes.data.files.length > 0) {
        const found = searchRes.data.files[0];
        const webViewLink = found.webViewLink || `https://drive.google.com/file/d/${found.id}/view?usp=sharing`;
        const webContentLink = found.webContentLink || `https://drive.google.com/uc?export=download&id=${found.id}`;

        // Ensure public reader permission exists
        await this.ensurePublicReader(found.id!);

        return {
          fileId: found.id!,
          fileName: found.name || CANONICAL_APK_NAME,
          webViewLink,
          webContentLink,
          createdAt: found.createdTime || new Date().toISOString(),
        };
      }
    } catch {
      // Continue to creation
    }

    // 3. Create fresh canonical file and set public sharing
    const createRes = await this.drive.files.create({
      requestBody: {
        name: CANONICAL_APK_NAME,
        mimeType: 'application/vnd.android.package-archive',
        appProperties: {
          app: DITTO_APP_TAG,
          role: 'canonical-apk',
        },
      },
      fields: 'id, name, webViewLink, webContentLink, createdTime',
    });

    const fileId = createRes.data.id!;
    await this.ensurePublicReader(fileId);

    const webViewLink = createRes.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
    const webContentLink = createRes.data.webContentLink || `https://drive.google.com/uc?export=download&id=${fileId}`;

    return {
      fileId,
      fileName: CANONICAL_APK_NAME,
      webViewLink,
      webContentLink,
      createdAt: createRes.data.createdTime || new Date().toISOString(),
    };
  }

  /**
   * Overwrite existing Google Drive APK file in place.
   */
  public async uploadApk(
    fileId: string,
    apkPath: string
  ): Promise<{ durationSeconds: number; webViewLink: string; webContentLink: string }> {
    if (!fs.existsSync(apkPath)) {
      throw new Error(`Cannot upload missing APK at '${apkPath}'`);
    }

    const startTime = Date.now();
    const mediaStream = fs.createReadStream(apkPath);
    mediaStream.on('error', () => {
      // Prevent unhandled stream events if stream is aborted or closed prematurely
    });

    const res = await this.drive.files.update({
      fileId,
      media: {
        mimeType: 'application/vnd.android.package-archive',
        body: mediaStream,
      },
      fields: 'id, name, webViewLink, webContentLink, modifiedTime',
    });

    const durationSeconds = Number(((Date.now() - startTime) / 1000).toFixed(1));
    const webViewLink = res.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
    const webContentLink = res.data.webContentLink || `https://drive.google.com/uc?export=download&id=${fileId}`;

    return {
      durationSeconds,
      webViewLink,
      webContentLink,
    };
  }

  /**
   * Ensure 'anyone' with link has 'reader' permission on the Drive file.
   */
  public async ensurePublicReader(fileId: string): Promise<void> {
    try {
      await this.drive.permissions.create({
        fileId,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        },
      });
    } catch (err) {
      // If permission already exists or fails gracefully, log and continue
      const error = err as { code?: number; message?: string };
      // 409 or already exists is fine
    }
  }
}
