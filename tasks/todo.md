# Ditto Development Checklist

## Phase 1: Project Scaffolding & State Engine
- [ ] Task 1.1: Project initialization (package.json, tsconfig.json, Vitest config, build scripts)
- [ ] Task 1.2: Type definitions (`src/types/index.ts`)
- [ ] Task 1.3: State store implementation with atomic `.tmp` swap and directory lock (`src/storage/state-store.ts`)
- [ ] Task 1.4: Unit tests for state persistence and concurrency locking (`tests/state-store.test.ts`)
- [ ] Checkpoint 1: Run `npm test` and verify Phase 1 passes

## Phase 2: Android Build Engine & Dynamic APK Inspector
- [ ] Task 2.1: Gradle wrapper and Android project root detector (`src/android/gradle-detector.ts`)
- [ ] Task 2.2: Build runner executing `assembleDebug` with child process timeout (`src/android/build-runner.ts`)
- [ ] Task 2.3: Dynamic APK locator and binary `AndroidManifest.xml` parser (`src/android/apk-parser.ts`)
- [ ] Task 2.4: Unit tests for Android detector and APK parser (`tests/android.test.ts`)
- [ ] Checkpoint 2: Run `npm test` and verify Phase 2 passes

## Phase 3: Google Drive Integration & Overwrite Engine
- [ ] Task 3.1: PKCE loopback OAuth client with token refresh (`src/drive/oauth-client.ts`)
- [ ] Task 3.2: Drive manager with canonical file discovery, creation, and `files.update` overwrite (`src/drive/drive-manager.ts`)
- [ ] Task 3.3: Integration tests for Google Drive client operations (`tests/drive-manager.test.ts`)
- [ ] Checkpoint 3: Run `npm test` and verify Phase 3 passes

## Phase 4: CLI Interface & Antigravity Agent Skill
- [ ] Task 4.1: Executable CLI entrypoint and commands: `auth`, `deliver`, `status` (`bin/ditto.js`, `src/cli.ts`)
- [ ] Task 4.2: Antigravity Skill definition (`skills/apk-delivery/SKILL.md`)
- [ ] Task 4.3: End-to-end integration and schema verification (`tests/cli.test.ts`)
- [ ] Checkpoint 4: Verify complete build and test suite (`npm run build && npm test`)
