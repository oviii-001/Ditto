import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { runCli } from '../src/cli.js';
import { StateStore } from '../src/storage/state-store.js';
import { DittoState } from '../src/types/index.js';

describe('CLI Integration & Schema Verification', () => {
  let tempDittoDir: string;
  let tempProjectDir: string;
  let originalExit: any;
  let exitCode: number | null = null;
  let stdoutOutput: string = '';
  let stderrOutput: string = '';

  beforeEach(() => {
    tempDittoDir = path.join(os.tmpdir(), `ditto-cli-state-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`);
    tempProjectDir = path.join(os.tmpdir(), `ditto-cli-project-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`);

    fs.mkdirSync(tempDittoDir, { recursive: true });
    fs.mkdirSync(tempProjectDir, { recursive: true });

    // Mock process.exit
    exitCode = null;
    originalExit = process.exit;
    process.exit = vi.fn((code?: any) => {
      exitCode = typeof code === 'number' ? code : 1;
      throw new Error(`process.exit called with ${exitCode}`);
    }) as any;

    stdoutOutput = '';
    stderrOutput = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((str: any) => {
      stdoutOutput += str.toString();
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((str: any) => {
      stderrOutput += str.toString();
      return true;
    });
  });

  afterEach(() => {
    process.exit = originalExit;
    vi.restoreAllMocks();

    if (fs.existsSync(tempDittoDir)) fs.rmSync(tempDittoDir, { recursive: true, force: true });
    if (fs.existsSync(tempProjectDir)) fs.rmSync(tempProjectDir, { recursive: true, force: true });
  });

  it('prints status JSON correctly when requested', async () => {
    // Override homedir temporarily or mock StateStore
    const mockState: DittoState = {
      version: '1.0.0',
      oauth: {
        clientId: 'mock-client',
        clientSecret: 'mock-secret',
        tokens: { access_token: 'abc' },
      },
      drive: {
        fileId: 'mock-file-123',
        fileName: 'Latest-debug.apk',
        webViewLink: 'https://drive.google.com/view/mock-file-123',
        webContentLink: 'https://drive.google.com/download/mock-file-123',
        createdAt: '2026-10-30T12:00:00Z',
      },
    };

    // Spy on StateStore.prototype.loadState to return mockState
    vi.spyOn(StateStore.prototype, 'loadState').mockReturnValue(mockState);

    await runCli(['status', '--json']);

    expect(stdoutOutput).toContain('"mock-file-123"');
    const parsed = JSON.parse(stdoutOutput.trim());
    expect(parsed.drive.fileId).toBe('mock-file-123');
    expect(parsed.drive.fileName).toBe('Latest-debug.apk');
  });

  it('outputs error JSON when running deliver without prior authentication', async () => {
    vi.spyOn(StateStore.prototype, 'loadState').mockReturnValue(null);

    await expect(runCli(['deliver', '--json'])).rejects.toThrow(/process.exit/);

    expect(stdoutOutput).toContain('"status": "error"');
    expect(stdoutOutput).toContain('Ditto is not authorized');
  });

  it('runs complete deliver pipeline successfully with JSON output', async () => {
    // 1. Set up synthetic Android project
    const isWindows = process.platform === 'win32';
    const wrapper = isWindows ? 'gradlew.bat' : 'gradlew';
    fs.writeFileSync(path.join(tempProjectDir, 'settings.gradle.kts'), '// settings');
    fs.writeFileSync(path.join(tempProjectDir, wrapper), '#!/bin/sh');

    // Minimal valid ZIP file for mock APK
    const apkDir = path.join(tempProjectDir, 'app', 'build', 'outputs', 'apk', 'debug');
    fs.mkdirSync(apkDir, { recursive: true });
    const apkPath = path.join(apkDir, 'app-debug.apk');

    // Create minimal valid zip
    const zipBytes = Buffer.from([
      0x50, 0x4b, 0x05, 0x06, // EOCD signature
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00
    ]);
    // Prepend local header so APKParser sees PK\x03\x04
    const headerBytes = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    fs.writeFileSync(apkPath, Buffer.concat([headerBytes, zipBytes]));

    // 2. Set up authenticated state
    const mockState: DittoState = {
      version: '1.0.0',
      oauth: {
        clientId: 'mock-client',
        clientSecret: 'mock-secret',
        tokens: { access_token: 'valid-token' },
      },
      drive: {
        fileId: 'perm-file-789',
        fileName: 'Latest-debug.apk',
        webViewLink: 'https://drive.google.com/file/d/perm-file-789/view',
        webContentLink: 'https://drive.google.com/uc?export=download&id=perm-file-789',
        createdAt: '2026-10-30T10:00:00Z',
      },
    };

    vi.spyOn(StateStore.prototype, 'loadState').mockReturnValue(mockState);
    const saveStateSpy = vi.spyOn(StateStore.prototype, 'saveState').mockImplementation(() => {});

    // Mock DriveManager methods
    const { DriveManager } = await import('../src/drive/drive-manager.js');
    vi.spyOn(DriveManager.prototype, 'getOrCreateCanonicalFile').mockResolvedValue({
      fileId: 'perm-file-789',
      fileName: 'Latest-debug.apk',
      webViewLink: 'https://drive.google.com/file/d/perm-file-789/view',
      webContentLink: 'https://drive.google.com/uc?export=download&id=perm-file-789',
      createdAt: '2026-10-30T10:00:00Z',
    });

    vi.spyOn(DriveManager.prototype, 'uploadApk').mockResolvedValue({
      durationSeconds: 1.2,
      webViewLink: 'https://drive.google.com/file/d/perm-file-789/view',
      webContentLink: 'https://drive.google.com/uc?export=download&id=perm-file-789',
    });

    // 3. Run deliver
    await runCli(['deliver', '--json', '--dir', tempProjectDir, '--skip-build']);

    // 4. Verify stdout schema for AI agents
    const jsonOutput = stdoutOutput.trim();
    const result = JSON.parse(jsonOutput);

    expect(result.status).toBe('success');
    expect(result.project.name).toBe(path.basename(tempProjectDir));
    expect(result.artifact.fileName).toBe('Latest-debug.apk');
    expect(result.drive.fileId).toBe('perm-file-789');
    expect(result.drive.webViewUrl).toBe('https://drive.google.com/file/d/perm-file-789/view');
    expect(result.drive.overwritten).toBe(true);
    expect(saveStateSpy).toHaveBeenCalled();
  });

  it('prints version when --version or -v is passed', async () => {
    await runCli(['--version']);
    expect(stdoutOutput).toContain('1.0.0');

    stdoutOutput = '';
    await runCli(['-v']);
    expect(stdoutOutput).toContain('1.0.0');

    stdoutOutput = '';
    await runCli(['version']);
    expect(stdoutOutput).toContain('1.0.0');
  });
});
