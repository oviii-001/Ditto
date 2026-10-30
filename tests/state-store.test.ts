import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { StateStore } from '../src/storage/state-store.js';
import { DittoState } from '../src/types/index.js';

describe('StateStore', () => {
  let tempDir: string;
  let store: StateStore;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `ditto-test-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`);
    store = new StateStore(tempDir);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('returns null when state file does not exist', () => {
    expect(store.loadState()).toBeNull();
  });

  it('saves and loads state correctly with atomic write', () => {
    const mockState: DittoState = {
      version: '1.0.0',
      oauth: {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        tokens: {
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
        },
      },
      drive: {
        fileId: 'file-123',
        fileName: 'Latest-debug.apk',
        webViewLink: 'https://drive.google.com/view/123',
        webContentLink: 'https://drive.google.com/download/123',
        createdAt: new Date().toISOString(),
      },
    };

    store.saveState(mockState);
    const loaded = store.loadState();
    expect(loaded).toEqual(mockState);
    expect(fs.existsSync(store.getStateFilePath())).toBe(true);
  });

  it('acquires and releases directory lock cleanly', async () => {
    const unlock = await store.acquireLock(1000);
    expect(fs.existsSync(path.join(tempDir, 'lock'))).toBe(true);

    unlock();
    expect(fs.existsSync(path.join(tempDir, 'lock'))).toBe(false);
  });

  it('executes within withLock and releases lock afterwards', async () => {
    let executed = false;
    await store.withLock(async () => {
      expect(fs.existsSync(path.join(tempDir, 'lock'))).toBe(true);
      executed = true;
    });

    expect(executed).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'lock'))).toBe(false);
  });

  it('times out when trying to acquire lock held by another process', async () => {
    const unlock = await store.acquireLock(1000);

    const store2 = new StateStore(tempDir);
    await expect(store2.acquireLock(200)).rejects.toThrow(/Timed out waiting to acquire lock/);

    unlock();
  });

  it('recovers from stale lock exceeding threshold', async () => {
    // Manually create lock directory and set its mtime into the past
    store.ensureBaseDir();
    const lockPath = path.join(tempDir, 'lock');
    fs.mkdirSync(lockPath);
    const pastTime = new Date(Date.now() - 70000);
    fs.utimesSync(lockPath, pastTime, pastTime);

    // acquireLock with 60000ms stale threshold should recover and acquire
    const unlock = await store.acquireLock(1000, 60000);
    expect(fs.existsSync(lockPath)).toBe(true);
    unlock();
    expect(fs.existsSync(lockPath)).toBe(false);
  });
});
