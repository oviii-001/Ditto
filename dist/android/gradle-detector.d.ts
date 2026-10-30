import { AndroidProject } from '../types/index.js';
export declare class GradleDetector {
    /**
     * Search upwards starting from startDir to detect the Android project root and Gradle wrapper.
     */
    static detect(startDir?: string): AndroidProject;
}
