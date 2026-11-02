# Plan: Fix Google Drive Direct Download APK Caching Issue

## Root Cause Investigation
1. **Google Drive CDN Caching on Static URLs:**
   `https://drive.google.com/uc?export=download&id={FILE_ID}` uses a static URL with identical `FILE_ID`. When an APK is overwritten via `drive.files.update`, Google Drive's edge servers and CDN cache continue serving the older revision for up to several hours.
2. **Mobile Chrome / Android Download Manager Caching:**
   Mobile browsers cache identical download URIs or match existing downloaded files in `/sdcard/Download/`, skipping redownloading the fresh binary.
3. **Google Drive Web Viewer (`webViewUrl`) Behavior:**
   `webViewUrl` (`https://drive.google.com/file/d/.../view`) opens Google Drive's web application, which queries live metadata and dynamically generates unique, ephemeral download tokens when the user clicks "Download".
4. **Agent Link Formatting Confusion:**
   `skills/apk-delivery/SKILL.md` contained ambiguous link instructions with nested parentheses: `[{artifact.fileName} ({drive.webViewUrl})]({drive.webViewUrl})`, prompting AI agents to provide two distinct links (`Latest-debug.apk` for `directDownloadUrl` and `Google Drive` for `webViewUrl`). Because `directDownloadUrl` lacked cache-busting, clicking `Latest-debug.apk` resulted in downloading the stale build.

---

## Tasks

### Task 1: Add Dynamic Cache-Buster and Scan Bypass to `directDownloadUrl`
- File: `src/drive/drive-manager.ts`
- Action: In `uploadApk()`, append `t=${Date.now()}` and `confirm=t` to `webContentLink`.
- Acceptance criteria:
  - `webContentLink` contains `t=<timestamp>` and `confirm=t`.
  - Every upload produces a unique URL that forces Google's CDN and Android's browser to bypass cache.

### Task 2: Standardize Terminal Link Presentation
- File: `src/cli.ts`
- Action: In human-readable output (non-JSON mode), explicitly print both `Direct Download` (with cache buster) and `Drive Viewer`.

### Task 3: Clarify `apk-delivery` Agent Chat Card
- File: `skills/apk-delivery/SKILL.md`
- Action:
  - Replace ambiguous nested link template with crystal-clear Markdown links:
    - `[Direct Download APK ({artifact.fileName})]({drive.directDownloadUrl})`
    - `[View in Google Drive]({drive.webViewUrl})`
  - Explicitly document the cache-busting guarantee in the skill prompt.
  - Synchronize updated skill into `~/.gemini/config/skills/apk-delivery/SKILL.md`.

### Task 4: Regression Tests & Verification
- Files: `tests/drive-manager.test.ts`, `tests/regression.test.ts`
- Action:
  - Test `uploadApk` outputs cache-busted direct download URLs with `t=` and `confirm=t`.
  - Test CLI payload preserves cache-busting parameter.
  - Run full test suite (`npm test`).
  - Run `npm run build`.
