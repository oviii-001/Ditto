import { DittoState } from '../types/index.js';
export declare class StateStore {
    private baseDir;
    private stateFilePath;
    private lockPath;
    constructor(customDir?: string);
    getBaseDir(): string;
    getStateFilePath(): string;
    ensureBaseDir(): void;
    loadState(): DittoState | null;
    saveState(state: DittoState): void;
    /**
     * Acquire a directory-based atomic lock with timeout and stale lock recovery.
     */
    acquireLock(timeoutMs?: number, staleThresholdMs?: number): Promise<() => void>;
    releaseLock(): void;
    /**
     * Execute an operation inside a locked block
     */
    withLock<T>(fn: () => Promise<T>, timeoutMs?: number): Promise<T>;
}
