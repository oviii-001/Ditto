import { spawn } from 'node:child_process';
import { SkillInstaller } from './skill-installer.js';
export class Updater {
    static REPO = 'oviii-001/Ditto';
    static NPM_PACKAGE = 'github:oviii-001/Ditto@latest';
    /**
     * Checks GitHub for the latest release/version of Ditto.
     */
    static async checkForUpdates(currentVersion) {
        try {
            const url = `https://raw.githubusercontent.com/${this.REPO}/main/package.json`;
            const res = await fetch(url, {
                signal: AbortSignal.timeout(4000),
                headers: { 'User-Agent': 'Ditto-CLI' },
            });
            if (res.ok) {
                const pkg = (await res.json());
                const latestVersion = pkg.version || null;
                if (latestVersion) {
                    return {
                        currentVersion,
                        latestVersion,
                        hasUpdate: latestVersion !== currentVersion,
                    };
                }
            }
        }
        catch {
            // Offline, timeout, or network issue - return gracefully
        }
        return {
            currentVersion,
            latestVersion: null,
            hasUpdate: false,
        };
    }
    /**
     * Installs the latest version of Ditto CLI globally via npm.
     */
    static async installLatestCli(pkgSpec = this.NPM_PACKAGE, spawnFn = spawn) {
        return new Promise((resolve, reject) => {
            const isWin = process.platform === 'win32';
            const cmd = isWin ? 'npm.cmd' : 'npm';
            const args = ['install', '-g', pkgSpec];
            const child = spawnFn(cmd, args, {
                stdio: 'inherit',
                shell: isWin,
            });
            child.on('close', (code) => {
                if (code === 0) {
                    resolve();
                }
                else {
                    reject(new Error(`npm install exited with code ${code}`));
                }
            });
            child.on('error', (err) => {
                reject(err);
            });
        });
    }
    /**
     * Refreshes the Antigravity agent skills in the detected skills directory.
     */
    static refreshSkills() {
        const res = SkillInstaller.installSkill();
        return { installedSkills: res.installedSkills };
    }
}
//# sourceMappingURL=updater.js.map