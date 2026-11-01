import { spawn } from 'node:child_process';
import { SkillInstaller } from './skill-installer.js';

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string | null;
  hasUpdate: boolean;
}

export class Updater {
  public static readonly REPO = 'oviii-001/Ditto';
  public static readonly NPM_PACKAGE = 'github:oviii-001/Ditto@latest';

  /**
   * Checks GitHub for the latest release/version of Ditto.
   */
  public static async checkForUpdates(currentVersion: string): Promise<UpdateCheckResult> {
    try {
      const url = `https://raw.githubusercontent.com/${this.REPO}/main/package.json`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(4000),
        headers: { 'User-Agent': 'Ditto-CLI' },
      });
      if (res.ok) {
        const pkg = (await res.json()) as { version?: string };
        const latestVersion = pkg.version || null;
        if (latestVersion) {
          return {
            currentVersion,
            latestVersion,
            hasUpdate: latestVersion !== currentVersion,
          };
        }
      }
    } catch {
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
  public static async installLatestCli(
    pkgSpec: string = this.NPM_PACKAGE,
    spawnFn: typeof spawn = spawn
  ): Promise<void> {
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
        } else {
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
  public static refreshSkills(): { installedSkills: string[] } {
    const res = SkillInstaller.installSkill();
    return { installedSkills: res.installedSkills };
  }
}
