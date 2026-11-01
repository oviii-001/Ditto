import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
export class SkillInstaller {
    static SKILL_NAMES = ['apk-delivery', 'apk-feedback'];
    /**
     * Detects Antigravity skills directories and installs bundled skills automatically.
     */
    static installSkill(customTargetDir) {
        const home = os.homedir();
        const candidateRoots = [
            path.join(home, '.gemini', 'config', 'skills'),
            path.join(home, '.gemini', 'antigravity', 'skills'),
            path.join(home, '.antigravity', 'skills'),
        ];
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const installedSkills = [];
        let primaryInstalledPath = '';
        let primaryIsNew = false;
        if (customTargetDir) {
            // Custom single-directory support (e.g., unit tests targeting a specific directory)
            const bundledSkillPath = path.resolve(__dirname, '..', 'skills', 'apk-delivery', 'SKILL.md');
            if (!fs.existsSync(bundledSkillPath)) {
                throw new Error(`Bundled skill definition not found at: ${bundledSkillPath}`);
            }
            fs.mkdirSync(customTargetDir, { recursive: true });
            const targetFile = path.join(customTargetDir, 'SKILL.md');
            const isNew = !fs.existsSync(targetFile);
            fs.writeFileSync(targetFile, fs.readFileSync(bundledSkillPath, 'utf8'), 'utf8');
            primaryInstalledPath = targetFile;
            primaryIsNew = isNew;
            installedSkills.push(targetFile);
            // If parent is a skills container, also install sibling apk-feedback
            const parentDir = path.dirname(customTargetDir);
            const feedbackBundled = path.resolve(__dirname, '..', 'skills', 'apk-feedback', 'SKILL.md');
            if (fs.existsSync(feedbackBundled)) {
                const feedbackDir = path.join(parentDir, 'apk-feedback');
                fs.mkdirSync(feedbackDir, { recursive: true });
                const feedbackTarget = path.join(feedbackDir, 'SKILL.md');
                fs.writeFileSync(feedbackTarget, fs.readFileSync(feedbackBundled, 'utf8'), 'utf8');
                installedSkills.push(feedbackTarget);
            }
        }
        else {
            // Standard multi-skill installation across detected Antigravity directory
            let chosenRoot = candidateRoots[0];
            for (const root of candidateRoots) {
                if (fs.existsSync(root) || fs.existsSync(path.dirname(root))) {
                    chosenRoot = root;
                    break;
                }
            }
            for (const skillName of this.SKILL_NAMES) {
                const bundledPath = path.resolve(__dirname, '..', 'skills', skillName, 'SKILL.md');
                if (fs.existsSync(bundledPath)) {
                    const targetDir = path.join(chosenRoot, skillName);
                    fs.mkdirSync(targetDir, { recursive: true });
                    const targetFile = path.join(targetDir, 'SKILL.md');
                    const isNew = !fs.existsSync(targetFile);
                    fs.writeFileSync(targetFile, fs.readFileSync(bundledPath, 'utf8'), 'utf8');
                    installedSkills.push(targetFile);
                    if (skillName === 'apk-delivery') {
                        primaryInstalledPath = targetFile;
                        primaryIsNew = isNew;
                    }
                }
            }
        }
        return {
            installedPath: primaryInstalledPath,
            isNew: primaryIsNew,
            installedSkills,
        };
    }
}
//# sourceMappingURL=skill-installer.js.map