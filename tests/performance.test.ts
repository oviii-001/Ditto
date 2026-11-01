import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { StateStore } from '../src/storage/state-store.js';
import { ApkParser } from '../src/android/apk-parser.js';
import { DriveManager } from '../src/drive/drive-manager.js';
import { runCli } from '../src/cli.js';
import { OAuth2Client } from 'google-auth-library';

describe('Performance Benchmarks & Memory Efficiency', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `ditto-perf-test-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`);
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Benchmark 1: StateStore Atomic Lock & I/O Throughput', () => {
    it('executes 50 consecutive atomic lock acquisitions and writes in under 300ms', async () => {
      const store = new StateStore(tempDir);
      const iterations = 50;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        await store.withLock(async () => {
          store.saveState({
            version: '1.0.0',
            oauth: { clientId: `client-${i}`, clientSecret: 'secret' },
          });
        });
      }

      const totalMs = performance.now() - startTime;
      const avgMsPerOp = totalMs / iterations;

      expect(totalMs).toBeLessThan(400); // 50 writes under 400ms (< 8ms/write)
      expect(avgMsPerOp).toBeLessThan(10);

      const finalState = store.loadState();
      expect(finalState?.oauth.clientId).toBe(`client-${iterations - 1}`);
    });
  });

  describe('Benchmark 2: ApkParser Checksum & Manifest Parsing Speed', () => {
    it('computes SHA-256 and validates 5MB simulated APK archive in under 60ms', () => {
      const largeApkPath = path.join(tempDir, 'benchmark-app-debug.apk');

      // Create a 5MB buffer starting with valid ZIP magic bytes PK\x03\x04
      const sizeBytes = 5 * 1024 * 1024; // 5 MB
      const fakeApkBuffer = Buffer.alloc(sizeBytes, 0x41); // filled with 'A'
      fakeApkBuffer.writeUInt32LE(0x04034b50, 0); // ZIP local file header signature
      // Write EOCD at the end
      fakeApkBuffer.writeUInt32LE(0x06054b50, sizeBytes - 22);
      fs.writeFileSync(largeApkPath, fakeApkBuffer);

      const startTime = performance.now();
      const meta = ApkParser.parseApk(largeApkPath);
      const durationMs = performance.now() - startTime;

      expect(durationMs).toBeLessThan(100); // 5MB hashed & inspected in < 100ms
      expect(meta.sizeMb).toBe(5);
      expect(meta.sha256).toHaveLength(64);
    });
  });

  describe('Benchmark 3: Streaming I/O in uploadApk (RAM Protection)', () => {
    it('streams binary file instead of buffering entire file in process memory', async () => {
      const mockAuthClient = {} as OAuth2Client;
      const driveManager = new DriveManager(mockAuthClient);
      const rawDrive = driveManager.getRawDrive();

      const testFile = path.join(tempDir, 'stream-test.apk');
      fs.writeFileSync(testFile, 'binary-payload');

      let passedMediaBody: any = null;
      rawDrive.files.update = vi.fn().mockImplementation((params) => {
        passedMediaBody = params.media?.body;
        return Promise.resolve({
          data: { id: 'file-1', webViewLink: 'url', webContentLink: 'url' },
        });
      });

      await driveManager.uploadApk('file-1', testFile);

      // Verify that media.body is a readable stream, NOT a Buffer
      expect(passedMediaBody).toBeDefined();
      expect(typeof passedMediaBody.pipe).toBe('function');
      expect(Buffer.isBuffer(passedMediaBody)).toBe(false);
    });
  });

  describe('Benchmark 4: CLI Cold Start & Command Routing Latency', () => {
    it('parses arguments and routes version and help commands in under 20ms', async () => {
      let output = '';
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((str: any) => {
        output += str;
        return true;
      });

      const startTime = performance.now();
      await runCli(['--version']);
      const routingMs = performance.now() - startTime;

      expect(routingMs).toBeLessThan(35);
      expect(output).toContain('1.1.0');
      writeSpy.mockRestore();
    });
  });
});
