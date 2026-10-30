import { spawn } from 'node:child_process';
import fs from 'node:fs';
export class BuildRunner {
    static async build(project, options = {}) {
        const task = options.task || 'assembleDebug';
        const timeoutMs = options.timeoutMs || 600000; // 10 minutes default
        // Ensure Unix executable permission if not Windows
        if (!project.isWindows && fs.existsSync(project.gradleWrapperPath)) {
            try {
                fs.chmodSync(project.gradleWrapperPath, 0o755);
            }
            catch {
                // ignore permission error if not permissible
            }
        }
        const startTime = Date.now();
        let stdoutData = '';
        let stderrData = '';
        return new Promise((resolve, reject) => {
            const child = spawn(project.gradleWrapperPath, [task], {
                cwd: project.projectRoot,
                shell: project.isWindows,
                env: { ...process.env },
            });
            const timer = setTimeout(() => {
                child.kill();
                reject(new Error(`Gradle build '${task}' timed out after ${timeoutMs / 1000} seconds.`));
            }, timeoutMs);
            child.stdout.on('data', (chunk) => {
                const text = chunk.toString();
                stdoutData += text;
                if (options.onProgress) {
                    options.onProgress(text);
                }
            });
            child.stderr.on('data', (chunk) => {
                const text = chunk.toString();
                stderrData += text;
                if (options.onProgress) {
                    options.onProgress(text);
                }
            });
            child.on('error', (err) => {
                clearTimeout(timer);
                reject(new Error(`Failed to start Gradle wrapper at ${project.gradleWrapperPath}: ${err.message}`));
            });
            child.on('close', (code) => {
                clearTimeout(timer);
                const durationSeconds = Number(((Date.now() - startTime) / 1000).toFixed(1));
                if (code === 0) {
                    resolve({
                        durationSeconds,
                        stdout: stdoutData,
                        stderr: stderrData,
                    });
                }
                else {
                    // Extract the most relevant error lines
                    const allOutput = stderrData || stdoutData;
                    const lines = allOutput.split(/\r?\n/).filter(line => line.trim().length > 0);
                    const errorSummary = lines.slice(-20).join('\n');
                    reject(new Error(`Gradle build '${task}' failed with exit code ${code} (${durationSeconds}s).\n` +
                        `Summary:\n${errorSummary}`));
                }
            });
        });
    }
}
//# sourceMappingURL=build-runner.js.map