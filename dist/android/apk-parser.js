import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
export class ApkParser {
    /**
     * Find the newest debug APK generated under the project root.
     */
    static findApk(projectRoot, sinceTimeMs = 0) {
        const candidates = [];
        function scanDir(dir, depth = 0) {
            if (depth > 8)
                return; // avoid deep recursion
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        // Skip node_modules, .git, .gradle
                        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.gradle') {
                            continue;
                        }
                        scanDir(fullPath, depth + 1);
                    }
                    else if (entry.isFile() && entry.name.endsWith('.apk')) {
                        if (!entry.name.includes('-unaligned') &&
                            !entry.name.includes('output-metadata')) {
                            const stats = fs.statSync(fullPath);
                            if (stats.size > 0 && stats.mtimeMs >= sinceTimeMs - 5000) {
                                candidates.push({ path: fullPath, mtimeMs: stats.mtimeMs });
                            }
                        }
                    }
                }
            }
            catch {
                // ignore unreadable directories
            }
        }
        // First search in common outputs/apk path if present
        const outputsPath = path.join(projectRoot, 'app', 'build', 'outputs', 'apk');
        if (fs.existsSync(outputsPath)) {
            scanDir(outputsPath, 0);
        }
        // If none found in standard app output, scan whole build directory
        if (candidates.length === 0) {
            scanDir(projectRoot, 0);
        }
        // If none found with timestamp filter (e.g. Gradle build was UP-TO-DATE),
        // retry scan without sinceTimeMs filter
        if (candidates.length === 0 && sinceTimeMs > 0) {
            return this.findApk(projectRoot, 0);
        }
        if (candidates.length === 0) {
            throw new Error(`No APK file found in '${projectRoot}'. Verify that the Gradle build task succeeded.`);
        }
        // Sort by: debug first, then newest mtime
        candidates.sort((a, b) => {
            const aIsDebug = a.path.toLowerCase().includes('debug') ? 1 : 0;
            const bIsDebug = b.path.toLowerCase().includes('debug') ? 1 : 0;
            if (aIsDebug !== bIsDebug) {
                return bIsDebug - aIsDebug;
            }
            return b.mtimeMs - a.mtimeMs;
        });
        return candidates[0].path;
    }
    /**
     * Parse APK file to extract metadata, checksum, and manifest attributes.
     */
    static parseApk(apkPath, projectRoot) {
        if (!fs.existsSync(apkPath)) {
            throw new Error(`APK file does not exist at '${apkPath}'`);
        }
        const stats = fs.statSync(apkPath);
        if (stats.size === 0) {
            throw new Error(`APK file at '${apkPath}' is empty`);
        }
        // Verify ZIP magic bytes (PK\x03\x04)
        const fd = fs.openSync(apkPath, 'r');
        const magicBuffer = Buffer.alloc(4);
        fs.readSync(fd, magicBuffer, 0, 4, 0);
        fs.closeSync(fd);
        if (magicBuffer.readUInt32LE(0) !== 0x04034b50) {
            throw new Error(`File at '${apkPath}' is not a valid ZIP/APK archive`);
        }
        // Compute SHA-256
        const fileBuffer = fs.readFileSync(apkPath);
        const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
        // Extract Manifest Info
        let packageName = 'unknown.package';
        let versionName = '1.0.0';
        let versionCode = 1;
        try {
            const manifestBuffer = this.extractFileFromZip(fileBuffer, 'AndroidManifest.xml');
            if (manifestBuffer) {
                const parsed = this.parseBinaryManifest(manifestBuffer);
                if (parsed.packageName)
                    packageName = parsed.packageName;
                if (parsed.versionName)
                    versionName = parsed.versionName;
                if (parsed.versionCode)
                    versionCode = parsed.versionCode;
            }
        }
        catch {
            // ignore axml parse error and try fallback below
        }
        // Fallback: Check merged manifest in project build intermediates if projectRoot given and package is still unknown
        if (packageName === 'unknown.package' && projectRoot) {
            const mergedManifest = this.findMergedManifestText(projectRoot);
            if (mergedManifest) {
                const pkgMatch = mergedManifest.match(/package="([^"]+)"/);
                const vNameMatch = mergedManifest.match(/android:versionName="([^"]+)"/);
                const vCodeMatch = mergedManifest.match(/android:versionCode="([^"]+)"/);
                if (pkgMatch)
                    packageName = pkgMatch[1];
                if (vNameMatch)
                    versionName = vNameMatch[1];
                if (vCodeMatch)
                    versionCode = parseInt(vCodeMatch[1], 10) || 1;
            }
        }
        const sizeBytes = stats.size;
        const sizeMb = Number((sizeBytes / (1024 * 1024)).toFixed(2));
        return {
            apkPath,
            fileName: path.basename(apkPath),
            sizeBytes,
            sizeMb,
            sha256,
            packageName,
            versionName,
            versionCode,
        };
    }
    /**
     * Find a file inside a ZIP buffer by filename and decompress it.
     */
    static extractFileFromZip(zipBuffer, targetFileName) {
        // Locate End of Central Directory (EOCD)
        // EOCD signature is 0x06054b50
        let eocdOffset = -1;
        for (let i = zipBuffer.length - 22; i >= Math.max(0, zipBuffer.length - 65557); i--) {
            if (zipBuffer.readUInt32LE(i) === 0x06054b50) {
                eocdOffset = i;
                break;
            }
        }
        if (eocdOffset === -1) {
            return null;
        }
        const cdOffset = zipBuffer.readUInt32LE(eocdOffset + 16);
        const totalEntries = zipBuffer.readUInt16LE(eocdOffset + 10);
        let currentOffset = cdOffset;
        for (let i = 0; i < totalEntries && currentOffset < eocdOffset; i++) {
            if (zipBuffer.readUInt32LE(currentOffset) !== 0x02014b50) {
                break;
            }
            const compressionMethod = zipBuffer.readUInt16LE(currentOffset + 10);
            const compressedSize = zipBuffer.readUInt32LE(currentOffset + 20);
            const fileNameLength = zipBuffer.readUInt16LE(currentOffset + 28);
            const extraLength = zipBuffer.readUInt16LE(currentOffset + 30);
            const commentLength = zipBuffer.readUInt16LE(currentOffset + 32);
            const localHeaderOffset = zipBuffer.readUInt32LE(currentOffset + 42);
            const fileName = zipBuffer.toString('utf8', currentOffset + 46, currentOffset + 46 + fileNameLength);
            if (fileName === targetFileName) {
                // Read local header to find data offset
                if (zipBuffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
                    return null;
                }
                const localFileNameLen = zipBuffer.readUInt16LE(localHeaderOffset + 26);
                const localExtraLen = zipBuffer.readUInt16LE(localHeaderOffset + 28);
                const dataStart = localHeaderOffset + 30 + localFileNameLen + localExtraLen;
                const compressedData = zipBuffer.subarray(dataStart, dataStart + compressedSize);
                if (compressionMethod === 0) {
                    // Stored
                    return Buffer.from(compressedData);
                }
                else if (compressionMethod === 8) {
                    // Deflated
                    return zlib.inflateRawSync(compressedData);
                }
                return null;
            }
            currentOffset += 46 + fileNameLength + extraLength + commentLength;
        }
        return null;
    }
    /**
     * Parse Android Binary XML (AXML) to extract package name, versionName, and versionCode.
     */
    static parseBinaryManifest(buf) {
        if (buf.length < 8)
            return {};
        const magic = buf.readUInt32LE(0);
        // Standard AXML magic is 0x00080003
        if (magic !== 0x00080003) {
            return {};
        }
        let offset = 8;
        // Chunk type 0x00010001 or 0x001C0001 is String Pool
        const chunkType = buf.readUInt16LE(offset);
        if (chunkType !== 0x0001) {
            return {};
        }
        const headerSize = buf.readUInt16LE(offset + 2);
        const chunkSize = buf.readUInt32LE(offset + 4);
        const stringCount = buf.readUInt32LE(offset + 8);
        const flags = buf.readUInt32LE(offset + 16);
        const stringsStart = buf.readUInt32LE(offset + 20);
        const isUtf8 = (flags & 0x0100) !== 0;
        const stringOffsets = [];
        for (let i = 0; i < stringCount; i++) {
            stringOffsets.push(buf.readUInt32LE(offset + 28 + i * 4));
        }
        const poolStart = offset + stringsStart;
        const strings = [];
        for (let i = 0; i < stringCount; i++) {
            const strOffset = poolStart + stringOffsets[i];
            if (strOffset >= buf.length) {
                strings.push('');
                continue;
            }
            if (isUtf8) {
                // UTF-8 string: length is 1 or 2 bytes
                let lenOffset = strOffset;
                let charLen = buf[lenOffset++];
                if ((charLen & 0x80) !== 0)
                    lenOffset++;
                let byteLen = buf[lenOffset++];
                if ((byteLen & 0x80) !== 0)
                    lenOffset++;
                const end = lenOffset + byteLen;
                strings.push(buf.toString('utf8', lenOffset, Math.min(end, buf.length)));
            }
            else {
                // UTF-16LE string: length in 2-byte units
                const charLen = buf.readUInt16LE(strOffset);
                const start = strOffset + 2;
                const end = start + charLen * 2;
                strings.push(buf.toString('utf16le', start, Math.min(end, buf.length)));
            }
        }
        let packageName;
        let versionName;
        let versionCode;
        // Scan the rest of chunks for XML elements and attributes
        let cur = offset + chunkSize;
        while (cur < buf.length - 8) {
            const type = buf.readUInt32LE(cur);
            const size = buf.readUInt32LE(cur + 4);
            if (size <= 0)
                break;
            // START_TAG chunk is 0x00100102
            if (type === 0x00100102) {
                const nameIdx = buf.readUInt32LE(cur + 20);
                const tagName = strings[nameIdx];
                if (tagName === 'manifest') {
                    const attrCount = buf.readUInt16LE(cur + 28);
                    // Each attribute is 20 bytes (5 x 32-bit words):
                    // ns_uri_idx, name_idx, val_str_idx, type, data
                    let attrStart = cur + 36;
                    for (let a = 0; a < attrCount; a++) {
                        const attrNameIdx = buf.readUInt32LE(attrStart + 4);
                        const attrValStrIdx = buf.readUInt32LE(attrStart + 8);
                        const attrType = buf.readUInt32LE(attrStart + 12);
                        const attrData = buf.readUInt32LE(attrStart + 16);
                        const attrName = strings[attrNameIdx];
                        if (attrName === 'package' && attrValStrIdx < strings.length) {
                            packageName = strings[attrValStrIdx];
                        }
                        else if (attrName === 'versionName' && attrValStrIdx < strings.length) {
                            versionName = strings[attrValStrIdx];
                        }
                        else if (attrName === 'versionCode') {
                            versionCode = attrData;
                        }
                        attrStart += 20;
                    }
                    break;
                }
            }
            cur += size;
        }
        return { packageName, versionName, versionCode };
    }
    /**
     * Search for plain-text merged AndroidManifest.xml in build directory.
     */
    static findMergedManifestText(projectRoot) {
        const searchDirs = [
            path.join(projectRoot, 'app', 'build', 'intermediates', 'merged_manifests'),
            path.join(projectRoot, 'app', 'build', 'intermediates', 'merged_manifest'),
            path.join(projectRoot, 'app', 'build', 'intermediates'),
            path.join(projectRoot, 'build', 'intermediates'),
        ];
        function findManifest(dir, depth = 0) {
            if (depth > 6)
                return null;
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const full = path.join(dir, entry.name);
                    if (entry.isFile() && entry.name === 'AndroidManifest.xml') {
                        return fs.readFileSync(full, 'utf8');
                    }
                    else if (entry.isDirectory()) {
                        const found = findManifest(full, depth + 1);
                        if (found)
                            return found;
                    }
                }
            }
            catch {
                // ignore
            }
            return null;
        }
        for (const sDir of searchDirs) {
            if (fs.existsSync(sDir)) {
                const result = findManifest(sDir, 0);
                if (result)
                    return result;
            }
        }
        return null;
    }
}
//# sourceMappingURL=apk-parser.js.map