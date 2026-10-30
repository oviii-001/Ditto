# Implementation Plan: Ditto (Android APK Delivery Automation)

## Overview
Ditto is a lightweight, production-grade CLI and Antigravity Agent Skill that automatically compiles Android debug APKs, extracts metadata, and replaces a single canonical Google Drive file (`Latest-debug.apk`), returning a permanent testing link directly to the Antigravity conversation.

## Architecture Decisions
- **Zero-DB File Store:** Local configuration and Drive references live in `~/.ditto/state.json` with directory-based lock protection.
- **Single Canonical Drive File:** Uses `drive.files.update` targeting an immutable `fileId`, self-healable via Google Drive `appProperties`.
- **SDK-Independent Binary APK Parser:** Reads `AndroidManifest.xml` binary XML from the ZIP directly, eliminating Android SDK PATH dependencies.
- **Agent Output Separation:** Strict JSON on `stdout` when `--json` is passed; user diagnostics on `stderr`.

---

## Task List & Execution Phases

### Phase 1: Project Scaffolding & State Engine
- [ ] Task 1.1: Initialize TypeScript Node.js project (Node 18+ ESM, Vitest, TypeScript strict, package scripts).
- [ ] Task 1.2: Implement `src/types/index.ts` defining data models for State, Android Project, APK Metadata, and Drive API payloads.
- [ ] Task 1.3: Implement `src/storage/state-store.ts` with atomic writes (`.tmp` swap) and directory locking.
- [ ] Task 1.4: Unit tests for state persistence, serialization, and concurrency locks.

### Checkpoint: Foundation
- [ ] All state-store tests pass (`npm test`).
- [ ] Lock concurrency verified under multi-process contention.

### Phase 2: Android Build Engine & Dynamic APK Inspector
- [ ] Task 2.1: Implement `src/android/gradle-detector.ts` to locate Android project root and appropriate wrapper (`gradlew.bat` vs `./gradlew`).
- [ ] Task 2.2: Implement `src/android/build-runner.ts` to run `assembleDebug` with child process timeout and output capture.
- [ ] Task 2.3: Implement `src/android/apk-parser.ts` to discover freshly generated APKs, compute SHA-256, and extract binary `AndroidManifest.xml` metadata (package name, versionCode, versionName).
- [ ] Task 2.4: Unit & integration tests for Gradle detection and APK parsing using synthetic APK zip fixtures.

### Checkpoint: Android Engine
- [ ] All Android detection, runner, and parser tests pass.
- [ ] Synthetic APK fixture correctly parses package name and version without external Android SDK tools.

### Phase 3: Google Drive Integration & Overwrite Engine
- [ ] Task 3.1: Implement `src/drive/oauth-client.ts` with PKCE local loopback HTTP server and token refresh handling.
- [ ] Task 3.2: Implement `src/drive/drive-manager.ts` handling self-healing file resolution (`appProperties`), initial file creation with public reader permissions, and `drive.files.update` resumable stream overwrite.
- [ ] Task 3.3: Mocked integration tests for Drive client (file lookup, creation, permission granting, and update overwrite).

### Checkpoint: Drive Integration
- [ ] Drive client verified against mocked Google Drive v3 API.
- [ ] Overwrite logic asserts `fileId` is preserved and never duplicated.

### Phase 4: CLI Interface & Antigravity Agent Skill
- [ ] Task 4.1: Implement `bin/ditto.js` and `src/cli.ts` routing commands:
  - `ditto auth`: Interactive Google Cloud Client ID/Secret entry and browser login.
  - `ditto deliver`: Orchestrates build -> parse -> Drive upload -> stdout JSON output.
  - `ditto status`: Shows current Drive file link, last upload timestamp, and auth status.
- [ ] Task 4.2: Author and install the Antigravity Agent Skill in `skills/apk-delivery/SKILL.md` (and copy to global Antigravity skills directory).
- [ ] Task 4.3: End-to-end smoke test verifying `ditto deliver --json` output schema matches agent contract.

### Checkpoint: Production Ready
- [ ] Full suite passes (`npm test && npm run build`).
- [ ] CLI runs smoothly and formats valid JSON on stdout.
- [ ] Antigravity skill ready for immediate agent use.

---

## Risks and Mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| User does not have Java/Android SDK installed | High | `ditto deliver` catches Gradle error early, leaves Drive file untouched, and logs clean diagnostic message. |
| Large APKs (>100MB) trigger Drive virus warning | Medium | Output provides both `webViewUrl` and `directDownloadUrl`. |
| Corrupt or incomplete APK build | High | APK parser validates ZIP header and non-zero byte size before triggering Drive upload. |
| User deletes Drive file manually | Medium | Drive manager detects 404 and self-heals by recreating the canonical file and updating local state. |
