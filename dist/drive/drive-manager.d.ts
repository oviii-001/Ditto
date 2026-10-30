import { drive_v3 } from '@googleapis/drive';
import { OAuth2Client } from 'google-auth-library';
import { CanonicalDriveFile } from '../types/index.js';
export declare const CANONICAL_APK_NAME = "Latest-debug.apk";
export declare const DITTO_APP_TAG = "ditto";
export declare class DriveManager {
    private drive;
    constructor(authClient: OAuth2Client);
    getRawDrive(): drive_v3.Drive;
    /**
     * Resolves the single canonical Drive file:
     * 1. Checks existing fileId from local state.
     * 2. If missing/invalid, recovers via Drive appProperties search.
     * 3. If still not found, creates the canonical file and sets public reader permission.
     */
    getOrCreateCanonicalFile(preferredFileId?: string): Promise<CanonicalDriveFile>;
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
