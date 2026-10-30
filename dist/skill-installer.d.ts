export declare class SkillInstaller {
    /**
     * Detects Antigravity skills directories and installs the apk-delivery skill automatically.
     */
    static installSkill(customTargetDir?: string): {
        installedPath: string;
        isNew: boolean;
    };
}
