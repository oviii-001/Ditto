/**
 * Ditto Core Type Definitions
 */

export interface OAuthTokens {
  access_token?: string | null;
  refresh_token?: string | null;
  scope?: string;
  token_type?: string | null;
  expiry_date?: number | null;
}

export interface CanonicalDriveFile {
  fileId: string;
  fileName: string;
  webViewLink: string;
  webContentLink: string;
  createdAt: string;
  lastUploadedAt?: string;
  lastProject?: string;
  lastPackageName?: string;
  lastVersionName?: string;
  lastVersionCode?: number;
  lastSha256?: string;
  lastSizeBytes?: number;
}

export interface DittoState {
  version: string;
  oauth: {
    clientId: string;
    clientSecret: string;
    tokens?: OAuthTokens;
  };
  drive?: CanonicalDriveFile;
}

export interface AndroidProject {
  projectRoot: string;
  projectName: string;
  gradleWrapperPath: string;
  isWindows: boolean;
}

export interface ApkMetadata {
  apkPath: string;
  fileName: string;
  sizeBytes: number;
  sizeMb: number;
  sha256: string;
  packageName: string;
  versionName: string;
  versionCode: number;
}

export interface DeliveryResult {
  status: 'success' | 'error';
  project?: {
    name: string;
    root: string;
    packageName: string;
    versionName: string;
    versionCode: number;
  };
  artifact?: {
    fileName: string;
    sizeMb: number;
    sha256: string;
    buildDurationSec: number;
    uploadDurationSec: number;
  };
  drive?: {
    fileId: string;
    webViewUrl: string;
    directDownloadUrl: string;
    overwritten: boolean;
  };
  error?: string;
}
