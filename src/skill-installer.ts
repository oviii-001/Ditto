import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export class SkillInstaller {
  /**
   * Detects Antigravity skills directories and installs the apk-delivery skill automatically.
   */
  public static installSkill(): { installedPath: string; isNew: boolean } {
    const home = os.homedir();
    const candidateDirs = [
      path.join(home, '.gemini', 'config', 'skills', 'apk-delivery'),
      path.join(home, '.gemini', 'antigravity', 'skills', 'apk-delivery'),
      path.join(home, '.antigravity', 'skills', 'apk-delivery'),
    ];

    // Find our bundled SKILL.md
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const bundledSkillPath = path.resolve(__dirname, '..', 'skills', 'apk-delivery', 'SKILL.md');

    if (!fs.existsSync(bundledSkillPath)) {
      throw new Error(`Bundled skill definition not found at: ${bundledSkillPath}`);
    }

    const skillContent = fs.readFileSync(bundledSkillPath, 'utf8');

    // Pick target: prefer directory whose parent exists, or default to first candidate
    let targetDir = candidateDirs[0];
    for (const dir of candidateDirs) {
      const parentDir = path.dirname(dir);
      if (fs.existsSync(parentDir)) {
        targetDir = dir;
        break;
      }
    }

    fs.mkdirSync(targetDir, { recursive: true });
    const targetFile = path.join(targetDir, 'SKILL.md');
    const isNew = !fs.existsSync(targetFile);

    fs.writeFileSync(targetFile, skillContent, 'utf8');

    return { installedPath: targetFile, isNew };
  }
}
