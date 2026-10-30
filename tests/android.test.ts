import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { GradleDetector } from '../src/android/gradle-detector.js';
import { ApkParser } from '../src/android/apk-parser.js';

describe('Android Build Engine & APK Inspector', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `ditto-android-test-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`);
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('GradleDetector', () => {
    it('throws error when no Android Gradle project is detected', () => {
      expect(() => GradleDetector.detect(tempDir)).toThrow(/No Android project detected/);
    });

    it('detects Android project root from root folder', () => {
      const isWindows = process.platform === 'win32';
      const wrapperName = isWindows ? 'gradlew.bat' : 'gradlew';

      fs.writeFileSync(path.join(tempDir, 'settings.gradle.kts'), '// settings');
      fs.writeFileSync(path.join(tempDir, wrapperName), '@echo off');

      const project = GradleDetector.detect(tempDir);
      expect(project.projectRoot).toBe(tempDir);
      expect(project.gradleWrapperPath).toBe(path.join(tempDir, wrapperName));
      expect(project.isWindows).toBe(isWindows);
    });

    it('detects Android project root from deep subfolder', () => {
      const isWindows = process.platform === 'win32';
      const wrapperName = isWindows ? 'gradlew.bat' : 'gradlew';

      fs.writeFileSync(path.join(tempDir, 'settings.gradle'), '// settings');
      fs.writeFileSync(path.join(tempDir, wrapperName), '#!/bin/sh');

      const deepDir = path.join(tempDir, 'app', 'src', 'main', 'java', 'com', 'example');
      fs.mkdirSync(deepDir, { recursive: true });

      const project = GradleDetector.detect(deepDir);
      expect(project.projectRoot).toBe(tempDir);
      expect(project.gradleWrapperPath).toBe(path.join(tempDir, wrapperName));
    });
  });

  describe('ApkParser', () => {
    function createMockZipWithStoredFile(filePath: string, innerFileName: string, innerContent: Buffer): void {
      // Build a minimal valid ZIP archive
      const fileNameBuf = Buffer.from(innerFileName, 'utf8');
      const fileData = innerContent;
      const crc = crypto.createHash('sha256').update(fileData).digest().readUInt32LE(0); // mock crc

      // Local File Header (30 + fileNameLen + fileLen)
      const localHeader = Buffer.alloc(30);
      localHeader.writeUInt32LE(0x04034b50, 0); // signature
      localHeader.writeUInt16LE(20, 4); // version needed
      localHeader.writeUInt16LE(0, 6); // flags
      localHeader.writeUInt16LE(0, 8); // compression method: 0 (stored)
      localHeader.writeUInt16LE(0, 10); // mod time
      localHeader.writeUInt16LE(0, 12); // mod date
      localHeader.writeUInt32LE(crc, 14); // crc32
      localHeader.writeUInt32LE(fileData.length, 18); // compressed size
      localHeader.writeUInt32LE(fileData.length, 22); // uncompressed size
      localHeader.writeUInt16LE(fileNameBuf.length, 26); // file name length
      localHeader.writeUInt16LE(0, 28); // extra field length

      const localRecord = Buffer.concat([localHeader, fileNameBuf, fileData]);

      // Central Directory Header (46 + fileNameLen)
      const cdHeader = Buffer.alloc(46);
      cdHeader.writeUInt32LE(0x02014b50, 0); // signature
      cdHeader.writeUInt16LE(20, 4); // version made by
      cdHeader.writeUInt16LE(20, 6); // version needed
      cdHeader.writeUInt16LE(0, 8); // flags
      cdHeader.writeUInt16LE(0, 10); // compression method (0)
      cdHeader.writeUInt16LE(0, 12); // mod time
      cdHeader.writeUInt16LE(0, 14); // mod date
      cdHeader.writeUInt32LE(crc, 16); // crc32
      cdHeader.writeUInt32LE(fileData.length, 20); // compressed size
      cdHeader.writeUInt32LE(fileData.length, 24); // uncompressed size
      cdHeader.writeUInt16LE(fileNameBuf.length, 28); // file name length
      cdHeader.writeUInt16LE(0, 30); // extra length
      cdHeader.writeUInt16LE(0, 32); // comment length
      cdHeader.writeUInt16LE(0, 34); // disk number
      cdHeader.writeUInt16LE(0, 36); // internal attr
      cdHeader.writeUInt32LE(0, 38); // external attr
      cdHeader.writeUInt32LE(0, 42); // relative offset of local header (0)

      const cdRecord = Buffer.concat([cdHeader, fileNameBuf]);

      // End of Central Directory Record (22 bytes)
      const eocd = Buffer.alloc(22);
      eocd.writeUInt32LE(0x06054b50, 0); // signature
      eocd.writeUInt16LE(0, 4); // disk num
      eocd.writeUInt16LE(0, 6); // cd disk num
      eocd.writeUInt16LE(1, 8); // cd records on disk
      eocd.writeUInt16LE(1, 10); // total cd records
      eocd.writeUInt32LE(cdRecord.length, 12); // cd size
      eocd.writeUInt32LE(localRecord.length, 16); // offset of cd
      eocd.writeUInt16LE(0, 20); // comment length

      const zipFileContent = Buffer.concat([localRecord, cdRecord, eocd]);
      fs.writeFileSync(filePath, zipFileContent);
    }

    it('extracts stored file from zip correctly', () => {
      const zipPath = path.join(tempDir, 'test.apk');
      const content = Buffer.from('Hello Android World', 'utf8');
      createMockZipWithStoredFile(zipPath, 'test.txt', content);

      const zipBuffer = fs.readFileSync(zipPath);
      const extracted = ApkParser.extractFileFromZip(zipBuffer, 'test.txt');
      expect(extracted).not.toBeNull();
      expect(extracted!.toString('utf8')).toBe('Hello Android World');
    });

    it('locates debug APK dynamically in build outputs', () => {
      const apkDir = path.join(tempDir, 'app', 'build', 'outputs', 'apk', 'debug');
      fs.mkdirSync(apkDir, { recursive: true });

      const appDebugApk = path.join(apkDir, 'app-debug.apk');
      const unalignedApk = path.join(apkDir, 'app-debug-unaligned.apk');

      createMockZipWithStoredFile(appDebugApk, 'res.txt', Buffer.from('debug'));
      createMockZipWithStoredFile(unalignedApk, 'res.txt', Buffer.from('unaligned'));

      const found = ApkParser.findApk(tempDir);
      expect(found).toBe(appDebugApk);
    });

    it('locates debug APK even when build is UP-TO-DATE (sinceTimeMs > file mtime)', () => {
      const apkDir = path.join(tempDir, 'app', 'build', 'outputs', 'apk', 'debug');
      fs.mkdirSync(apkDir, { recursive: true });

      const appDebugApk = path.join(apkDir, 'app-debug.apk');
      createMockZipWithStoredFile(appDebugApk, 'res.txt', Buffer.from('debug'));

      // simulate build starting after APK was written
      const futureBuildTime = Date.now() + 100000;
      const found = ApkParser.findApk(tempDir, futureBuildTime);
      expect(found).toBe(appDebugApk);
    });

    it('parses APK metadata and falls back to merged manifest when available', () => {
      const apkPath = path.join(tempDir, 'test-app-debug.apk');
      createMockZipWithStoredFile(apkPath, 'res.txt', Buffer.from('dummy-content'));

      // Create merged manifest in project structure
      const manifestDir = path.join(tempDir, 'app', 'build', 'intermediates', 'merged_manifests', 'debug', 'processDebugManifest');
      fs.mkdirSync(manifestDir, { recursive: true });
      fs.writeFileSync(
        path.join(manifestDir, 'AndroidManifest.xml'),
        `<manifest package="com.ditto.example" android:versionCode="42" android:versionName="2.1.0">
         </manifest>`
      );

      const meta = ApkParser.parseApk(apkPath, tempDir);
      expect(meta.packageName).toBe('com.ditto.example');
      expect(meta.versionCode).toBe(42);
      expect(meta.versionName).toBe('2.1.0');
      expect(meta.fileName).toBe('test-app-debug.apk');
      expect(meta.sha256).toBeDefined();
      expect(meta.sizeBytes).toBeGreaterThan(0);
    });
  });
});
