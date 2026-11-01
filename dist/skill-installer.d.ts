export declare class SkillInstaller {
    static readonly SKILL_NAMES: string[];
    /**
     * Detects Antigravity skills directories and installs bundled skills automatically.
     */
    static installSkill(customTargetDir?: string): {
        installedPath: string;
        isNew: boolean;
        installedSkills: string[];
    };
}
