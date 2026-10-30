import { AndroidProject } from '../types/index.js';
export interface BuildOptions {
    task?: string;
    timeoutMs?: number;
    onProgress?: (data: string) => void;
}
export interface BuildResult {
    durationSeconds: number;
    stdout: string;
    stderr: string;
}
export declare class BuildRunner {
    static build(project: AndroidProject, options?: BuildOptions): Promise<BuildResult>;
}
