import { ApkMetadata } from '../types/index.js';
export declare class ApkParser {
    /**
     * Find the newest debug APK generated under the project root.
     */
    static findApk(projectRoot: string, sinceTimeMs?: number): string;
    /**
     * Parse APK file to extract metadata, checksum, and manifest attributes.
     */
    static parseApk(apkPath: string, projectRoot?: string): ApkMetadata;
    /**
     * Find a file inside a ZIP buffer by filename and decompress it.
     */
    static extractFileFromZip(zipBuffer: Buffer, targetFileName: string): Buffer | null;
    /**
     * Parse Android Binary XML (AXML) to extract package name, versionName, and versionCode.
     */
    static parseBinaryManifest(buf: Buffer): {
        packageName?: string;
        versionName?: string;
        versionCode?: number;
    };
    /**
     * Search for plain-text merged AndroidManifest.xml in build directory.
     */
    private static findMergedManifestText;
}
