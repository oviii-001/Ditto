---
name: apk-feedback
description: Pulls mobile testing screenshots and visual feedback uploaded by the user from their phone to Google Drive, inspects UI bugs locally, and guides code fixes.
---

# Android APK Visual Feedback for Antigravity

Use this skill whenever the user has tested an Android debug build on their physical device and uploaded screenshots or visual bug reports to Google Drive (especially when using Antigravity remote control where direct image uploads into the chat are unavailable).

## The Inbound Feedback Principle

**Inbox Zero & Immediate Remote Purge:**  
When the user tests their APK on their phone, they share 1 or more screenshots to **Google Drive $\to$ `Ditto/Screenshots/`**.  
When this skill runs, Ditto downloads all pending screenshots into the local workspace (`.ditto/screenshots/`) and **immediately hard-deletes them from Google Drive**.

This guarantees:
- **Zero Drive clutter**: No leftover image files taking up space on Google Drive.
- **Zero ambiguity**: The remote inbox is drained to 0 files, so the agent always inspects the exact screenshots intended for the current bug report.

---

## Instructions for Antigravity Agents

### 1. Pulling Screenshots

When the user asks you to look at their screenshots, review mobile UI bugs, or check test feedback:

Run the feedback command from the project root:

```bash
ditto feedback --json
```

If the user specifically requested a certain count (e.g., *"check the last 2 screenshots"*):
```bash
ditto feedback --json --limit 2
```

If `ditto` is not in PATH, use:
```bash
npx github:oviii-001/Ditto feedback --json
```

### 2. Processing the JSON Result

Ditto outputs progress on `stderr` and prints a structured JSON object on `stdout`:

#### Success Payload Example:
```json
{
  "status": "success",
  "count": 2,
  "remotePurged": 2,
  "screenshots": [
    {
      "id": "1A2B3C...",
      "name": "Screenshot_20261101_223015.png",
      "localPath": "C:\\Users\\USERAS\\Desktop\\diu-schedule\\.ditto\\screenshots\\Screenshot_20261101_223015.png",
      "createdTime": "2026-11-01T16:30:15.000Z",
      "sizeBytes": 284190,
      "mimeType": "image/png"
    }
  ],
  "destinationDir": "C:\\Users\\USERAS\\Desktop\\diu-schedule\\.ditto\\screenshots"
}
```

### 3. Inspecting the Images

If `count > 0`:
1. Use your native `read_file` tool on each file's `localPath` in `screenshots`.
2. Analyze the visual rendering:
   - Identify broken layout constraints, misaligned text, truncated chips, or overlap.
   - Correlate the visual defect with the corresponding Jetpack Compose composable or XML layout in the codebase.

If `count === 0`:
Inform the user politely:
*"No screenshots were found in your Google Drive `Ditto/Screenshots` folder. To send screenshots from your phone, select the image(s) in your Gallery, tap Share $\to$ Google Drive $\to$ save to `Ditto/Screenshots`, then let me know!"*

### 4. Fixing and Closing the Loop

1. Edit the relevant UI code to fix the visual bug identified in the screenshots.
2. Verify that the code compiles.
3. Automatically run `apk-delivery` (`ditto deliver --json`) to build and overwrite the updated APK.
4. Notify the user in chat that the bug is fixed and their permanent download link has been updated!
