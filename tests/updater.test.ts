import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Updater } from '../src/updater.js';
import { SkillInstaller } from '../src/skill-installer.js';
import * as childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';

describe('Updater Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkForUpdates', () => {
    it('detects when an update is available', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ version: '2.0.0' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await Updater.checkForUpdates('1.1.0');
      expect(result.currentVersion).toBe('1.1.0');
      expect(result.latestVersion).toBe('2.0.0');
      expect(result.hasUpdate).toBe(true);
    });

    it('detects when already on the latest version', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ version: '1.1.0' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await Updater.checkForUpdates('1.1.0');
      expect(result.currentVersion).toBe('1.1.0');
      expect(result.latestVersion).toBe('1.1.0');
      expect(result.hasUpdate).toBe(false);
    });

    it('gracefully handles offline or network fetch failures', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network offline'));
      vi.stubGlobal('fetch', mockFetch);

      const result = await Updater.checkForUpdates('1.1.0');
      expect(result.currentVersion).toBe('1.1.0');
      expect(result.latestVersion).toBeNull();
      expect(result.hasUpdate).toBe(false);
    });
  });

  describe('refreshSkills', () => {
    it('delegates to SkillInstaller.installSkill and returns installed paths', () => {
      vi.spyOn(SkillInstaller, 'installSkill').mockReturnValue({
        installedPath: '/test/path/apk-delivery/SKILL.md',
        isNew: false,
        installedSkills: ['/test/path/apk-delivery/SKILL.md', '/test/path/apk-feedback/SKILL.md'],
      });

      const res = Updater.refreshSkills();
      expect(res.installedSkills).toHaveLength(2);
      expect(SkillInstaller.installSkill).toHaveBeenCalled();
    });
  });

  describe('installLatestCli', () => {
    it('spawns npm install -g with correct arguments', async () => {
      const mockChild = new EventEmitter() as any;
      const spawnSpy = vi.fn().mockImplementation(() => {
        setTimeout(() => mockChild.emit('close', 0), 10);
        return mockChild;
      });

      await expect(Updater.installLatestCli('test-pkg@latest', spawnSpy as any)).resolves.toBeUndefined();
      expect(spawnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/npm(\.cmd)?/),
        ['install', '-g', 'test-pkg@latest'],
        expect.any(Object)
      );
    });

    it('rejects if npm install exits with non-zero code', async () => {
      const mockChild = new EventEmitter() as any;
      const spawnSpy = vi.fn().mockImplementation(() => {
        setTimeout(() => mockChild.emit('close', 1), 10);
        return mockChild;
      });

      await expect(Updater.installLatestCli('test-pkg@latest', spawnSpy as any)).rejects.toThrow(
        /npm install exited with code 1/
      );
    });
  });
});
