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
});
