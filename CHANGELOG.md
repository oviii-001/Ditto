# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-30

### Added
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
- Test suite with 18 automated unit and integration tests across storage, Android inspector, Drive manager, and CLI.
