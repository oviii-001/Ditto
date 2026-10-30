import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DittoState } from '../types/index.js';

export class StateStore {
  private baseDir: string;
  private stateFilePath: string;
  private lockPath: string;

  constructor(customDir?: string) {
    this.baseDir = customDir || path.join(os.homedir(), '.ditto');
    this.stateFilePath = path.join(this.baseDir, 'state.json');
    this.lockPath = path.join(this.baseDir, 'lock');
  }

  public getBaseDir(): string {
    return this.baseDir;
  }

  public getStateFilePath(): string {
    return this.stateFilePath;
  }

  public ensureBaseDir(): void {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true, mode: 0o700 });
    }
  }

  public loadState(): DittoState | null {
    if (!fs.existsSync(this.stateFilePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(this.stateFilePath, 'utf8');
      return JSON.parse(content) as DittoState;
    } catch (err) {
      const error = err as Error;
      throw new Error(`Failed to read Ditto state file at ${this.stateFilePath}: ${error.message}`);
    }
  }

  public saveState(state: DittoState): void {
    this.ensureBaseDir();
    const tempFile = path.join(this.baseDir, `state.json.tmp.${Date.now()}.${Math.random().toString(36).substring(2, 8)}`);

    try {
      fs.writeFileSync(tempFile, JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tempFile, this.stateFilePath);
    } catch (err) {
      if (fs.existsSync(tempFile)) {
        try {
          fs.unlinkSync(tempFile);
        } catch {
          // ignore cleanup error
        }
      }
      const error = err as Error;
      throw new Error(`Failed to save Ditto state file at ${this.stateFilePath}: ${error.message}`);
    }
  }

  /**
   * Acquire a directory-based atomic lock with timeout and stale lock recovery.
   */
  public async acquireLock(timeoutMs: number = 10000, staleThresholdMs: number = 60000): Promise<() => void> {
    this.ensureBaseDir();
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        fs.mkdirSync(this.lockPath);
        // Lock acquired successfully
        return () => this.releaseLock();
      } catch (err) {
        const error = err as NodeJS.ErrnoException;
        if (error.code === 'EEXIST') {
          // Check if existing lock is stale
          try {
            const stats = fs.statSync(this.lockPath);
            const lockAge = Date.now() - stats.mtimeMs;
            if (lockAge > staleThresholdMs) {
              // Stale lock detected, forcefully remove
              fs.rmSync(this.lockPath, { recursive: true, force: true });
              continue;
            }
          } catch {
            // Lock might have been released just now, retry immediately
            continue;
          }

          // Wait with jitter before next attempt
          const waitTime = Math.floor(50 + Math.random() * 50);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        } else {
          throw error;
        }
      }
    }

    throw new Error(`Timed out waiting to acquire lock at ${this.lockPath} after ${timeoutMs}ms`);
  }

  public releaseLock(): void {
    if (fs.existsSync(this.lockPath)) {
      try {
        fs.rmSync(this.lockPath, { recursive: true, force: true });
      } catch {
        // ignore lock release error
      }
    }
  }

  /**
   * Execute an operation inside a locked block
   */
  public async withLock<T>(fn: () => Promise<T>, timeoutMs: number = 10000): Promise<T> {
    const unlock = await this.acquireLock(timeoutMs);
    try {
      return await fn();
    } finally {
      unlock();
    }
  }
}
