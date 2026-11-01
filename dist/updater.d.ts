import { spawn } from 'node:child_process';
export interface UpdateCheckResult {
    currentVersion: string;
    latestVersion: string | null;
    hasUpdate: boolean;
}
export declare class Updater {
    static readonly REPO = "oviii-001/Ditto";
    static readonly NPM_PACKAGE = "github:oviii-001/Ditto@latest";
    /**
     * Checks GitHub for the latest release/version of Ditto.
     */
    static checkForUpdates(currentVersion: string): Promise<UpdateCheckResult>;
    /**
     * Installs the latest version of Ditto CLI globally via npm.
     */
    static installLatestCli(pkgSpec?: string, spawnFn?: typeof spawn): Promise<void>;
    /**
     * Refreshes the Antigravity agent skills in the detected skills directory.
     */
    static refreshSkills(): {
        installedSkills: string[];
    };
}
