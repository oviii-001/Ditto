import fs from 'node:fs';
import path from 'node:path';
import { drive, drive_v3 } from '@googleapis/drive';
import { OAuth2Client } from 'google-auth-library';
import { CanonicalDriveFile, ScreenshotItem } from '../types/index.js';

export const CANONICAL_APK_NAME = 'Latest-debug.apk';
export const DITTO_FOLDER_NAME = 'Ditto';
export const BUILDS_FOLDER_NAME = 'Builds';
export const SCREENSHOTS_FOLDER_NAME = 'Screenshots';
export const DITTO_APP_TAG = 'ditto';
export const DITTO_BUILDS_TAG = 'builds-folder';
export const DITTO_SCREENSHOTS_TAG = 'screenshots-inbox';

export class DriveManager {
  private drive: drive_v3.Drive;

  constructor(authClient: OAuth2Client) {
    this.drive = drive({ version: 'v3', auth: authClient as any });
  }

  public getRawDrive(): drive_v3.Drive {
    return this.drive;
  }

  /**
   * Resolves or creates the dedicated 'Ditto' folder on Google Drive.
   */
  public async getOrCreateDittoFolder(preferredFolderId?: string): Promise<string> {
    // 1. Try preferred folder ID from local state
    if (preferredFolderId) {
      try {
        const res = await this.drive.files.get({
          fileId: preferredFolderId,
          fields: 'id, name, trashed, mimeType',
        });

        if (
          res.data.id &&
          !res.data.trashed &&
          res.data.mimeType === 'application/vnd.google-apps.folder'
        ) {
          return res.data.id;
        }
      } catch {
        // If 404 or missing, fall through to discovery/creation
      }
    }

    // 2. Search for existing folder with appProperties
    try {
      const searchRes = await this.drive.files.list({
        q: `appProperties has { key='app' and value='${DITTO_APP_TAG}' } and appProperties has { key='role' and value='ditto-folder' } and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name)',
        pageSize: 1,
      });

      if (searchRes.data.files && searchRes.data.files.length > 0) {
        return searchRes.data.files[0].id!;
      }
    } catch {
      // Continue to name search
    }

    // 3. Fallback: Search for folder by name
    try {
      const nameSearchRes = await this.drive.files.list({
        q: `name = '${DITTO_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name)',
        pageSize: 1,
      });

      if (nameSearchRes.data.files && nameSearchRes.data.files.length > 0) {
        return nameSearchRes.data.files[0].id!;
      }
    } catch {
      // Continue to creation
    }

    // 4. Create fresh 'Ditto' folder
    const createRes = await this.drive.files.create({
      requestBody: {
        name: DITTO_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
        appProperties: {
          app: DITTO_APP_TAG,
          role: 'ditto-folder',
        },
      },
      fields: 'id',
    });

    return createRes.data.id!;
  }

  /**
   * Resolves or creates the dedicated 'Ditto/Builds' folder on Google Drive.
   */
  public async getOrCreateBuildsFolder(
    preferredFolderId?: string,
    preferredParentDittoFolderId?: string
  ): Promise<string> {
    const parentFolderId = preferredParentDittoFolderId || (await this.getOrCreateDittoFolder());

    // 1. Try preferred folder ID from local state
    if (preferredFolderId) {
      try {
        const res = await this.drive.files.get({
          fileId: preferredFolderId,
          fields: 'id, name, trashed, mimeType, parents',
        });

        if (
          res.data.id &&
          !res.data.trashed &&
          res.data.mimeType === 'application/vnd.google-apps.folder'
        ) {
          return res.data.id;
        }
      } catch {
        // Fall through to discovery/creation
      }
    }

    // 2. Search for existing subfolder inside Ditto with appProperties
    try {
      const searchRes = await this.drive.files.list({
        q: `'${parentFolderId}' in parents and appProperties has { key='app' and value='${DITTO_APP_TAG}' } and appProperties has { key='role' and value='${DITTO_BUILDS_TAG}' } and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name)',
        pageSize: 1,
      });

      if (searchRes.data.files && searchRes.data.files.length > 0) {
        return searchRes.data.files[0].id!;
      }
    } catch {
      // Continue to name search
    }

    // 3. Fallback: Search for folder by name inside Ditto
    try {
      const nameSearchRes = await this.drive.files.list({
        q: `'${parentFolderId}' in parents and name = '${BUILDS_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name)',
        pageSize: 1,
      });

      if (nameSearchRes.data.files && nameSearchRes.data.files.length > 0) {
        return nameSearchRes.data.files[0].id!;
      }
    } catch {
      // Continue to creation
    }

    // 4. Create fresh 'Builds' subfolder inside 'Ditto'
    const createRes = await this.drive.files.create({
      requestBody: {
        name: BUILDS_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId],
        appProperties: {
          app: DITTO_APP_TAG,
          role: DITTO_BUILDS_TAG,
        },
      },
      fields: 'id',
    });

    return createRes.data.id!;
  }

  /**
   * Resolves or creates the dedicated 'Ditto/Screenshots' folder on Google Drive.
   */
  public async getOrCreateScreenshotsFolder(
    preferredFolderId?: string,
    preferredParentDittoFolderId?: string
  ): Promise<string> {
    const parentFolderId = preferredParentDittoFolderId || (await this.getOrCreateDittoFolder());

    // 1. Try preferred folder ID from local state
    if (preferredFolderId) {
      try {
        const res = await this.drive.files.get({
          fileId: preferredFolderId,
          fields: 'id, name, trashed, mimeType, parents',
        });

        if (
          res.data.id &&
          !res.data.trashed &&
          res.data.mimeType === 'application/vnd.google-apps.folder'
        ) {
          return res.data.id;
        }
      } catch {
        // Fall through to discovery/creation
      }
    }

    // 2. Search for existing subfolder inside Ditto with appProperties
    try {
      const searchRes = await this.drive.files.list({
        q: `'${parentFolderId}' in parents and appProperties has { key='app' and value='${DITTO_APP_TAG}' } and appProperties has { key='role' and value='${DITTO_SCREENSHOTS_TAG}' } and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name)',
        pageSize: 1,
      });

      if (searchRes.data.files && searchRes.data.files.length > 0) {
        return searchRes.data.files[0].id!;
      }
    } catch {
      // Continue to name search
    }

    // 3. Fallback: Search for folder by name inside Ditto
    try {
      const nameSearchRes = await this.drive.files.list({
        q: `'${parentFolderId}' in parents and name = '${SCREENSHOTS_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name)',
        pageSize: 1,
      });

      if (nameSearchRes.data.files && nameSearchRes.data.files.length > 0) {
        return nameSearchRes.data.files[0].id!;
      }
    } catch {
      // Continue to creation
    }

    // 4. Create fresh 'Screenshots' subfolder inside 'Ditto'
    const createRes = await this.drive.files.create({
      requestBody: {
        name: SCREENSHOTS_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId],
        appProperties: {
          app: DITTO_APP_TAG,
          role: DITTO_SCREENSHOTS_TAG,
        },
      },
      fields: 'id',
    });

    return createRes.data.id!;
  }

  /**
   * Moves a file into the target folder if not already inside it.
   */
  public async moveFileToFolder(fileId: string, targetFolderId: string, currentParents?: string[] | null): Promise<void> {
    if (currentParents && currentParents.includes(targetFolderId)) {
      return; // Already in target folder
    }

    try {
      const previousParents = (currentParents || []).filter(Boolean).join(',');
      await this.drive.files.update({
        fileId,
        addParents: targetFolderId,
        removeParents: previousParents.length > 0 ? previousParents : undefined,
        fields: 'id, parents',
      });
    } catch {
      // Non-fatal: if moving parents fails (e.g. edge permission), continue
    }
  }

  /**
   * Resolves the single canonical Drive file:
   * 1. Resolves/creates the dedicated 'Ditto' parent folder and 'Ditto/Builds' subfolder.
   * 2. Checks existing fileId from local state and migrates into 'Builds' folder if needed.
   * 3. If missing/invalid, recovers via Drive appProperties search and migrates into 'Builds' folder.
   * 4. If still not found, creates the canonical file inside the 'Ditto/Builds' folder with public reader permission.
   */
  public async getOrCreateCanonicalFile(
    preferredFileId?: string,
    preferredFolderId?: string,
    preferredBuildsFolderId?: string
  ): Promise<CanonicalDriveFile> {
    const folderId = await this.getOrCreateDittoFolder(preferredFolderId);
    const buildsFolderId = await this.getOrCreateBuildsFolder(preferredBuildsFolderId, folderId);

    // 1. Try preferred file ID from local state
    if (preferredFileId) {
      try {
        const res = await this.drive.files.get({
          fileId: preferredFileId,
          fields: 'id, name, trashed, parents, webViewLink, webContentLink, createdTime',
        });

        if (res.data.id && !res.data.trashed) {
          // Backward-compatible migration: move file into Ditto/Builds folder if not already there
          await this.moveFileToFolder(res.data.id, buildsFolderId, res.data.parents);

          const webViewLink = res.data.webViewLink || `https://drive.google.com/file/d/${res.data.id}/view?usp=sharing`;
          const webContentLink = res.data.webContentLink || `https://drive.google.com/uc?export=download&id=${res.data.id}`;

          return {
            fileId: res.data.id,
            folderId,
            buildsFolderId,
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
          // Non-404: log and continue to discovery
        }
      }
    }

    // 2. Self-Healing: Search for existing file tagged with appProperties
    try {
      const searchRes = await this.drive.files.list({
        q: `appProperties has { key='app' and value='${DITTO_APP_TAG}' } and trashed = false`,
        fields: 'files(id, name, parents, webViewLink, webContentLink, createdTime)',
        pageSize: 1,
      });

      if (searchRes.data.files && searchRes.data.files.length > 0) {
        const found = searchRes.data.files[0];

        // Ensure file is inside the Ditto/Builds folder
        await this.moveFileToFolder(found.id!, buildsFolderId, found.parents);

        const webViewLink = found.webViewLink || `https://drive.google.com/file/d/${found.id}/view?usp=sharing`;
        const webContentLink = found.webContentLink || `https://drive.google.com/uc?export=download&id=${found.id}`;

        // Ensure public reader permission exists
        await this.ensurePublicReader(found.id!);

        return {
          fileId: found.id!,
          folderId,
          buildsFolderId,
          fileName: found.name || CANONICAL_APK_NAME,
          webViewLink,
          webContentLink,
          createdAt: found.createdTime || new Date().toISOString(),
        };
      }
    } catch {
      // Continue to creation
    }

    // 3. Create fresh canonical file inside the 'Ditto/Builds' folder and set public sharing
    const createRes = await this.drive.files.create({
      requestBody: {
        name: CANONICAL_APK_NAME,
        mimeType: 'application/vnd.android.package-archive',
        parents: [buildsFolderId],
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
      folderId,
      buildsFolderId,
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

  /**
   * Pulls pending screenshots from Drive, saves them locally, and immediately hard-deletes them
   * from Drive so the remote folder remains at Inbox Zero.
   */
  public async pullScreenshots(
    targetLocalDir: string,
    options?: { limit?: number; folderId?: string }
  ): Promise<ScreenshotItem[]> {
    const folderId = options?.folderId || (await this.getOrCreateScreenshotsFolder());
    fs.mkdirSync(targetLocalDir, { recursive: true });

    const listRes = await this.drive.files.list({
      q: `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name, mimeType, size, createdTime)',
      orderBy: 'createdTime asc',
      pageSize: options?.limit && options.limit > 0 ? options.limit : 100,
    });

    const files = listRes.data.files || [];
    const items: ScreenshotItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.id) continue;

      // Clean and sanitize file naming against path traversal
      const ext = path.extname(file.name || '') || (file.mimeType?.includes('jpeg') ? '.jpg' : '.png');
      const baseRaw = path.basename(file.name || `screenshot_${Date.now()}_${i + 1}`, ext);
      let cleanBase = baseRaw.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.{2,}/g, '_');
      if (!cleanBase || cleanBase === '.' || cleanBase === '..') {
        cleanBase = `screenshot_${Date.now()}_${i + 1}`;
      }
      let targetFilename = `${cleanBase}${ext}`;
      let targetPath = path.resolve(targetLocalDir, targetFilename);

      // Defense-in-depth: ensure targetPath cannot escape targetLocalDir
      const resolvedTargetDir = path.resolve(targetLocalDir);
      if (!targetPath.startsWith(resolvedTargetDir)) {
        targetFilename = `screenshot_${Date.now()}_${i + 1}${ext}`;
        targetPath = path.resolve(resolvedTargetDir, targetFilename);
      }

      // Handle local collision
      let counter = 1;
      while (fs.existsSync(targetPath)) {
        targetFilename = `${cleanBase}_${counter}${ext}`;
        targetPath = path.join(targetLocalDir, targetFilename);
        counter++;
      }

      // Download file stream
      const streamRes = await this.drive.files.get(
        { fileId: file.id, alt: 'media' },
        { responseType: 'stream' }
      );

      await new Promise<void>((resolve, reject) => {
        if (typeof (streamRes.data as any)?.pipe === 'function') {
          const dest = fs.createWriteStream(targetPath);
          dest.on('finish', () => resolve());
          dest.on('error', reject);
          (streamRes.data as any).on('error', reject);
          (streamRes.data as any).pipe(dest);
        } else if (Buffer.isBuffer(streamRes.data)) {
          fs.writeFileSync(targetPath, streamRes.data);
          resolve();
        } else if (streamRes.data instanceof ArrayBuffer) {
          fs.writeFileSync(targetPath, Buffer.from(streamRes.data));
          resolve();
        } else {
          fs.writeFileSync(targetPath, Buffer.from(String(streamRes.data)));
          resolve();
        }
      });

      // Immediate Remote Hard-Delete (Inbox Zero)
      await this.drive.files.delete({ fileId: file.id });

      items.push({
        id: file.id,
        name: targetFilename,
        localPath: targetPath,
        createdTime: file.createdTime || undefined,
        sizeBytes: file.size ? Number(file.size) : undefined,
        mimeType: file.mimeType || undefined,
      });
    }

    return items;
  }

  /**
   * Purges all files in the screenshots folder (e.g., during pre-build sweep).
   */
  public async purgeScreenshots(preferredFolderId?: string): Promise<number> {
    const folderId = await this.getOrCreateScreenshotsFolder(preferredFolderId);
    try {
      const listRes = await this.drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'files(id)',
        pageSize: 100,
      });

      const files = listRes.data.files || [];
      for (const f of files) {
        if (f.id) {
          try {
            await this.drive.files.delete({ fileId: f.id });
          } catch {
            // Ignore single delete failures
          }
        }
      }
      return files.length;
    } catch {
      return 0;
    }
  }
}
