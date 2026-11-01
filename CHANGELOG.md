# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-11-01

### Added
- **Built-in `ditto update` Command**: Effortlessly upgrades the CLI package globally and synchronizes local Antigravity skills (`apk-delivery` and `apk-feedback`) without losing Google Drive credentials or configuration. Supports `--check` for non-invasive version verification.
- **Symmetrical Two-Way Architecture**: Dedicated subfolders on Google Drive: `Ditto/Builds/` (outbound `Latest-debug.apk`) and `Ditto/Screenshots/` (inbound feedback buffer).
- **`apk-feedback` Skill**: Automated incoming mobile bug screenshot ingestion into `.ditto/screenshots/` with immediate remote Drive cleanup (Inbox Zero) and UI defect inspection.
- **Automated Legacy Migration**: Transparently migrates existing canonical APKs from Drive root or `Ditto/` into `Ditto/Builds/` without changing file IDs or breaking permanent sharing URLs.
- **Quality Test Suites**: Added targeted test coverage for regression edge cases (`tests/regression.test.ts`), performance benchmarks (`tests/performance.test.ts`), and security hardening (`tests/security.test.ts`).

### Security
- **Path Traversal Defense**: Sanitized incoming remote screenshot filenames (`pullScreenshots`) by stripping illegal path traversal sequences (`../`), ensuring file writes are strictly contained within `.ditto/screenshots/`.
- **Command Injection Hardening**: Added validation to reject URL control characters (`\r`, `\n`) and enforce safe protocols (`http:`, `https:`) in browser opening logic (`openBrowser`).

## [1.0.0] - 2026-10-30

### Added
- First stable production release of Ditto.
- Core architecture design specification and implementation plan.
- Open source project structure with MIT License, CI workflow, and contribution guidelines.
- Atomic `StateStore` with directory concurrency locks and stale-lock recovery (`~/.ditto/state.json`).
- `GradleDetector` supporting multi-module Android projects, root detection, and platform wrapper resolution (`gradlew.bat` / `gradlew`).
- `BuildRunner` executing `assembleDebug` with child process timeout and output capture.
- `ApkParser` providing dynamic output APK discovery, SHA-256 calculation, and ZIP binary `AndroidManifest.xml` metadata extraction.
- `OAuthManager` implementing Google OAuth 2.0 PKCE desktop loopback authentication with `drive.file` scope and automatic token refresh.
- `DriveManager` implementing single canonical file discovery via `appProperties`, public reader permissions, and in-place `files.update` APK replacement.
- Production CLI command interface (`ditto auth`, `ditto deliver`, `ditto status`, `ditto doctor`) with machine-readable `--json` stream separation for AI agents.
- Antigravity AI Agent Skill (`skills/apk-delivery/SKILL.md`).
- Automated unit and integration test suite across storage, Android inspector, Drive manager, and CLI.
