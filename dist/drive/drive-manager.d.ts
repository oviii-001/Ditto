import { drive_v3 } from '@googleapis/drive';
import { OAuth2Client } from 'google-auth-library';
import { CanonicalDriveFile } from '../types/index.js';
export declare const CANONICAL_APK_NAME = "Latest-debug.apk";
export declare const DITTO_FOLDER_NAME = "Ditto";
export declare const DITTO_APP_TAG = "ditto";
export declare class DriveManager {
    private drive;
    constructor(authClient: OAuth2Client);
    getRawDrive(): drive_v3.Drive;
    /**
     * Resolves or creates the dedicated 'Ditto' folder on Google Drive.
     */
    getOrCreateDittoFolder(preferredFolderId?: string): Promise<string>;
    /**
     * Moves a file into the target folder if not already inside it.
     */
    moveFileToFolder(fileId: string, targetFolderId: string, currentParents?: string[] | null): Promise<void>;
    /**
     * Resolves the single canonical Drive file:
     * 1. Resolves/creates the dedicated 'Ditto' folder.
     * 2. Checks existing fileId from local state and migrates into folder if needed.
     * 3. If missing/invalid, recovers via Drive appProperties search and migrates into folder.
     * 4. If still not found, creates the canonical file inside the 'Ditto' folder with public reader permission.
     */
    getOrCreateCanonicalFile(preferredFileId?: string, preferredFolderId?: string): Promise<CanonicalDriveFile>;
    /**
     * Overwrite existing Google Drive APK file in place.
     */
    uploadApk(fileId: string, apkPath: string): Promise<{
        durationSeconds: number;
        webViewLink: string;
        webContentLink: string;
    }>;
    /**
     * Ensure 'anyone' with link has 'reader' permission on the Drive file.
     */
    ensurePublicReader(fileId: string): Promise<void>;
}
