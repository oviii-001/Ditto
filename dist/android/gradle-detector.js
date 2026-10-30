import fs from 'node:fs';
import path from 'node:path';
export class GradleDetector {
    /**
     * Search upwards starting from startDir to detect the Android project root and Gradle wrapper.
     */
    static detect(startDir = process.cwd()) {
        let currentDir = path.resolve(startDir);
        const root = path.parse(currentDir).root;
        const isWindows = process.platform === 'win32';
        const wrapperName = isWindows ? 'gradlew.bat' : 'gradlew';
        while (true) {
            const hasSettingsGradle = fs.existsSync(path.join(currentDir, 'settings.gradle')) ||
                fs.existsSync(path.join(currentDir, 'settings.gradle.kts'));
            const wrapperPath = path.join(currentDir, wrapperName);
            const hasWrapper = fs.existsSync(wrapperPath);
            if (hasSettingsGradle && hasWrapper) {
                return {
                    projectRoot: currentDir,
                    projectName: path.basename(currentDir),
                    gradleWrapperPath: wrapperPath,
                    isWindows,
                };
            }
            // Also support standalone module with build.gradle and gradlew
            const hasBuildGradle = fs.existsSync(path.join(currentDir, 'build.gradle')) ||
                fs.existsSync(path.join(currentDir, 'build.gradle.kts'));
            if (hasBuildGradle && hasWrapper) {
                return {
                    projectRoot: currentDir,
                    projectName: path.basename(currentDir),
                    gradleWrapperPath: wrapperPath,
                    isWindows,
                };
            }
            // Stop if reached system root
            if (currentDir === root) {
                break;
            }
            const parentDir = path.dirname(currentDir);
            if (parentDir === currentDir) {
                break;
            }
            currentDir = parentDir;
        }
        throw new Error(`No Android project detected at '${startDir}' or parent directories.\n` +
            `Ensure that '${wrapperName}' and 'settings.gradle(.kts)' exist in the project root.`);
    }
}
//# sourceMappingURL=gradle-detector.js.map