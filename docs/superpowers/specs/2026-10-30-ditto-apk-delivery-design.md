# Technical Design Specification: Ditto (Android APK Delivery Automation for Antigravity)

**Date:** 2026-10-30  
**Project:** Ditto  
**Status:** Approved  
**Target:** Senior Engineers, AI Agents (Antigravity), Android Developers  

---

## 1. Executive Summary

**Ditto** is a minimalist, production-grade CLI and AI agent automation tool for Android developers using Google Antigravity. It bridges the gap between remote AI task execution and on-device manual testing:
1. An AI agent completes an Android coding task.
2. The agent executes `ditto deliver`.
3. Ditto locates the Android project, invokes the Gradle wrapper to build the debug APK, verifies the output, and extracts package metadata.
4. Ditto uploads the APK to Google Drive, overwriting a single, canonical, permanent file (`Latest-debug.apk`) using `drive.files.update` across any project on the machine.
5. The permanent public download link remains identical across builds and projects.
6. Ditto outputs a machine-readable JSON payload to `stdout`, and the agent notifies the user in the Antigravity chat with the direct download link.

---

## 2. Core Principles & Architectural Decisions

### 2.1 One User, One Permanent APK File
- **No File ID Churn:** The Google Drive `fileId` never changes after initial creation.
- **Cross-Project Overwrite:** Regardless of whether the user works on Project A or Project B, the output APK replaces the content of the single file in Google Drive.
- **Zero Duplicate Clutter:** Google Drive contains exactly one visible file for Ditto testing.
- **Reconstruction via App Properties:** If local state is ever wiped, Ditto queries Google Drive for `appProperties has { key='app' and value='ditto' }` to recover the canonical file instead of creating duplicate files.

### 2.2 Security & Least-Privilege OAuth 2.0
- **OAuth Scope:** Strictly `https://www.googleapis.com/auth/drive.file`.
  - Ditto *only* has access to files it created. It cannot access, view, or modify the developer's personal Drive files or folders.
- **Local Credentials:** Stored in `~/.ditto/state.json` (or `%USERPROFILE%\.ditto\state.json` on Windows) with read/write access restricted to the current user.
- **Developer OAuth Setup:** During `ditto auth`, the user provides their Google Cloud `clientId` and `clientSecret` (with step-by-step terminal instructions). This avoids shared quota limits, external proxy servers, or third-party credential dependencies.

### 2.3 Headless & Agent-Centric Design (The Ponytail Discipline)
- **Zero TUI Bloat:** No interactive curses/clack spinners when running non-interactively or with `--json`.
- **Pure Output Stream Separation:**
  - `stdout`: Strictly formatted JSON when `--json` is supplied (consumed by Antigravity).
  - `stderr`: Human-readable diagnostics and progress logs.
- **Zero Database Overhead:** No SQLite, Prisma, or external server. Single atomic JSON file with file locking handles state reliably.

---

## 3. Detailed Component Architecture

### 3.1 Module Breakdown

```
Ditto/
├── bin/
│   └── ditto.js                 # Executable entrypoint (#!/usr/bin/env node)
├── src/
│   ├── cli.ts                   # CLI argument parsing and command routing
│   ├── commands/
│   │   ├── auth.ts              # Interactive OAuth login & credential setup
│   │   ├── deliver.ts           # Orchestrates build -> verify -> upload -> report
│   │   ├── status.ts            # Inspects local state, auth, and Drive file info
│   │   └── doctor.ts            # Environment diagnosis (Java, Gradle, OAuth, network)
│   ├── android/
│   │   ├── gradle-detector.ts   # Locates project root and gradlew/gradlew.bat
│   │   ├── build-runner.ts      # Executes assembleDebug with timeout & stream capture
│   │   └── apk-parser.ts        # Dynamic APK locator, SHA-256 hash, manifest extractor
│   ├── drive/
│   │   ├── oauth-client.ts      # PKCE loopback HTTP server & token refresh manager
│   │   ├── drive-manager.ts     # files.create, files.update, permissions, appProperties
│   │   └── resumable-upload.ts  # Stream-based chunked uploader
│   ├── storage/
│   │   └── state-store.ts       # Atomic JSON read/write with directory locking
│   └── types/
│       └── index.ts             # Strongly typed data models
├── skills/
│   └── apk-delivery/
│       └── SKILL.md             # Global Antigravity Skill definition
├── package.json
└── tsconfig.json
```

---

## 4. Subsystems Specification

### 4.1 State & Storage (`~/.ditto/state.json`)

The storage engine uses atomic file writes (write to `.tmp` then rename) and directory locking to ensure concurrent agents never corrupt state.

```typescript
export interface DittoState {
  version: "1.0.0";
  oauth: {
    clientId: string;
    clientSecret: string;
    tokens?: {
      access_token: string;
      refresh_token: string;
      scope: string;
      token_type: string;
      expiry_date: number;
    };
  };
  drive?: {
    fileId: string;
    fileName: string;
    webViewLink: string;
    webContentLink: string;
    createdAt: string;
    lastUploadedAt?: string;
    lastProject?: string;
    lastPackageName?: string;
    lastVersionName?: string;
    lastVersionCode?: number;
    lastSha256?: string;
    lastSizeBytes?: number;
  };
}
```

### 4.2 Android Build Engine (`src/android/`)
1. **Root Detection:** Scans current working directory upwards for `settings.gradle`, `settings.gradle.kts`, or `build.gradle(.kts)`.
2. **Gradle Wrapper Selection:**
   - Windows: `.\gradlew.bat`
   - Unix/macOS: `./gradlew` (ensures `chmod +x` executable bit)
3. **Build Execution:** Spawns `gradlew assembleDebug` with working directory set to project root. Captures stdout/stderr. If exit code != 0, extracts error snippet and halts without touching Drive.
4. **Dynamic APK Discovery:**
   - Recursively scans `<projectRoot>/**/build/outputs/apk/` for `.apk` files modified after build initiation.
   - Filters out unaligned or intermediate artifacts; prioritizes `*debug*.apk`.
   - Validates ZIP header (`0x04034b50`).
   - Calculates SHA-256 checksum and exact file size.
   - Extracts Android package name, `versionCode`, and `versionName` by reading binary `AndroidManifest.xml` from the APK ZIP archive directly (native JS parser, no Android SDK CLI required).

### 4.3 Google Drive Engine (`src/drive/`)
1. **OAuth Loopback Flow:**
   - Starts local HTTP server on `http://127.0.0.1:0` (ephemeral port).
   - Generates Google OAuth 2.0 authorization URL with `access_type=offline`, `prompt=consent`, and scope `https://www.googleapis.com/auth/drive.file`.
   - Automatically opens default browser via platform native command (`start`, `open`, or `xdg-open`).
   - Handles callback, exchanges auth code for refresh and access tokens, saves to `state.json`, and returns friendly HTML response to browser.
2. **Canonical File Management:**
   - **Step 1:** Read `state.drive.fileId`.
   - **Step 2 (Self-Healing):** If `fileId` is missing from local state, execute:
     `drive.files.list({ q: "appProperties has { key='app' and value='ditto' } and trashed = false", fields: "files(id, name, webViewLink, webContentLink)" })`.
   - **Step 3 (Creation):** If no existing file found on Drive:
     `drive.files.create({ requestBody: { name: "Latest-debug.apk", appProperties: { app: "ditto", role: "canonical-apk" } } })`.
     Immediately add public reader permission:
     `drive.permissions.create({ fileId, requestBody: { role: "reader", type: "anyone" } })`.
   - **Step 4 (Update / Overwrite):**
     Execute resumable update:
     `drive.files.update({ fileId, media: { mimeType: "application/vnd.android.package-archive", body: fs.createReadStream(apkPath) }, fields: "id, name, webViewLink, webContentLink, modifiedTime" })`.

### 4.4 Antigravity Integration & Output Contract

When invoked via `ditto deliver --json`, stdout is guaranteed to output a single JSON document on the final line:

```json
{
  "status": "success",
  "project": {
    "name": "DIU Campus Schedule",
    "root": "C:\\Users\\USERAS\\Desktop\\diu-schedule",
    "packageName": "com.diu.schedule",
    "versionName": "1.0.4",
    "versionCode": 42
  },
  "artifact": {
    "fileName": "Latest-debug.apk",
    "sizeMb": 18.42,
    "sha256": "3a4b5c6d...",
    "buildDurationSec": 22.4,
    "uploadDurationSec": 6.8
  },
  "drive": {
    "fileId": "1a2b3c4d5e6f7g8h9i0j",
    "webViewUrl": "https://drive.google.com/file/d/1a2b3c4d5e6f7g8h9i0j/view?usp=sharing",
    "directDownloadUrl": "https://drive.google.com/uc?export=download&id=1a2b3c4d5e6f7g8h9i0j",
    "overwritten": true
  }
}
```

---

## 5. Antigravity Skill Definition (`skills/apk-delivery/SKILL.md`)

The skill informs the AI agent how to interact with Ditto:
```markdown
---
name: apk-delivery
description: Automatically builds Android debug APK and delivers it to the user's permanent Google Drive test link after completing Android tasks.
---

# Android APK Delivery for Antigravity

When you finish modifying or building an Android application and the task is ready for user testing:

1. Execute the delivery command in the project directory:
   `npx ditto deliver --json` (or `ditto deliver --json` if installed globally)

2. Parse the resulting JSON output.

3. Notify the user in your response with a formatted card:
   - **Project:** {project.name} ({project.packageName})
   - **Version:** {project.versionName} (Build {project.versionCode})
   - **Size:** {artifact.sizeMb} MB
   - **Permanent Test Link:** [{drive.webViewUrl}]
   - Note: Mention that this replaces the previous APK on their phone testing link.
```

---

## 6. Error Handling & Edge Cases

| Failure Mode | Detection | Recovery Action |
|---|---|---|
| **Gradle compilation failure** | `gradlew` exits with code != 0 | Abort immediately. Log error message to `stderr`. Never touch Google Drive. Previous APK preserved. |
| **No Android project in CWD** | No `gradlew` or `settings.gradle` in hierarchy | Exit with clear instructions: `Not an Android project directory`. |
| **Drive file trashed or deleted** | `files.update` returns 404 | Catch 404, automatically invoke creation routine, update `state.json` with new `fileId`, set public permission, upload. |
| **Token expired / revoked** | Google API returns 401 | Auto-refresh via OAuth client refresh token. If refresh token invalid, fail gracefully advising user to run `ditto auth`. |
| **Drive download scan warning (>100MB)** | APK size exceeds 100MB | Include both `webViewUrl` (Google Drive viewer with download button) and `directDownloadUrl`. |
| **Concurrent agent executions** | Multiple `ditto deliver` runs | File lock on `~/.ditto/delivery.lock` blocks secondary runs with 60s timeout. |

---

## 7. Verification & Testing Strategy

1. **Unit Tests (Vitest):**
   - State manager atomic read/write and lock behavior.
   - Binary Android manifest parser against sample APK fixtures.
   - Dynamic Gradle project locator and command builder.
2. **Integration Tests (Mocked Google API):**
   - OAuth token refresh flow.
   - Drive file existence check and `files.update` overwrite.
3. **End-to-End Test (Real Android Project + Real Drive):**
   - Run `ditto auth` with test credentials.
   - Run `ditto deliver` on a sample Android project.
   - Run `ditto deliver` on a second sample Android project.
   - Assert that Drive contains exactly one file with matching updated sha256 and package name.
