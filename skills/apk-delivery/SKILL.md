---
name: apk-delivery
description: Automatically builds Android debug APK and delivers it to the user's permanent Google Drive test link after completing Android tasks.
---

# Android APK Delivery for Antigravity

Use this skill when you have completed an Android development task (feature implementation, bug fix, UI modification, or refactoring) and the application is ready for the user to download, install, and test on their Android device.

## Core Delivery Principle

**One user, one permanent test link.**  
Ditto overwrites a single canonical file (`Latest-debug.apk`) in the user's Google Drive across all projects. The Drive file ID and the download link never change.

---

## Instructions for Antigravity Agents

### 1. Triggering Delivery

After your Android code changes are in place and compile cleanly:

Run the delivery command from the Android project root directory:

```bash
npx ditto-apk deliver --json
```

*(If installed globally or in local development, `ditto deliver --json` also works).*

### 2. Processing the Result

Ditto outputs human-readable progress on `stderr` and prints a single machine-readable JSON object on `stdout`:

#### Success Payload Example:
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

### 3. Notifying the User in Chat

When `status === "success"`, post a clear, formatted card in your conversation response:

```markdown
### 📱 Android Build Ready for Testing!

- **Project:** {project.name} (`{project.packageName}`)
- **Version:** {project.versionName} (Build {project.versionCode})
- **Size:** {artifact.sizeMb} MB
- **Build Time:** {artifact.buildDurationSec}s | **Upload:** {artifact.uploadDurationSec}s
- **Permanent Download Link:** [{artifact.fileName} ({drive.webViewUrl})]({drive.webViewUrl})

*(Note: This build replaces the previous APK on your permanent phone testing link).*
```

### 4. Handling Errors

If `status === "error"`:
- If the error states `Ditto is not authorized`: Tell the user to run `ditto auth` in their terminal to connect their Google Drive.
- If the error is a Gradle compilation failure: Provide the Gradle error summary from `error` and offer to fix the build issue before retrying.
