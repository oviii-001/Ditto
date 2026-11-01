import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SkillInstaller } from '../src/skill-installer.js';

describe('SkillInstaller', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `ditto-skill-test-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`);
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('installs the apk-delivery skill into a custom directory (RED -> GREEN)', () => {
    const targetDir = path.join(tempDir, 'skills', 'apk-delivery');
    
    // In RED phase: installSkill with customTargetDir
    const result = SkillInstaller.installSkill(targetDir);

    expect(result.installedPath).toBe(path.join(targetDir, 'SKILL.md'));
    expect(fs.existsSync(result.installedPath)).toBe(true);

    const content = fs.readFileSync(result.installedPath, 'utf8');
    expect(content).toContain('name: apk-delivery');
    expect(content).toContain('Android APK Delivery for Antigravity');
    expect(result.isNew).toBe(true);

    // Second run should recognize it is not new
    const secondResult = SkillInstaller.installSkill(targetDir);
    expect(secondResult.isNew).toBe(false);
  });

  it('installs both apk-delivery and apk-feedback skills', () => {
    const targetDir = path.join(tempDir, 'skills', 'apk-delivery');
    const result = SkillInstaller.installSkill(targetDir);

    expect(result.installedSkills.length).toBeGreaterThanOrEqual(2);

    const feedbackPath = path.join(tempDir, 'skills', 'apk-feedback', 'SKILL.md');
    expect(fs.existsSync(feedbackPath)).toBe(true);

    const feedbackContent = fs.readFileSync(feedbackPath, 'utf8');
    expect(feedbackContent).toContain('name: apk-feedback');
    expect(feedbackContent).toContain('Android APK Visual Feedback for Antigravity');
    expect(feedbackContent).toContain('ditto feedback --json');
  });
});
