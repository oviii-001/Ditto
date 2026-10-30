import readline from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { StateStore } from './storage/state-store.js';
import { OAuthManager } from './drive/oauth-client.js';
import { DriveManager } from './drive/drive-manager.js';
import { GradleDetector } from './android/gradle-detector.js';
import { BuildRunner } from './android/build-runner.js';
import { ApkParser } from './android/apk-parser.js';
import { DeliveryResult, DittoState } from './types/index.js';

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = argv.slice();
  const command = args[0] || 'help';

  const store = new StateStore();

  switch (command) {
    case 'auth':
      await handleAuth(store);
      break;

    case 'deliver':
      await handleDeliver(store, args.slice(1));
      break;

    case 'status':
      await handleStatus(store, args.slice(1));
      break;

    case 'doctor':
      await handleDoctor(store);
      break;

    case 'help':
    case '--help':
    case '-h':
      printHelp();
      break;

    default:
      console.error(`Unknown command: '${command}'. Run 'ditto help' for available commands.`);
      process.exit(1);
  }
}

async function handleAuth(store: StateStore): Promise<void> {
  console.log('\n=== Ditto Google Drive Authorization ===\n');
  console.log('Ditto connects to Google Drive using your own Google Cloud OAuth Client ID.');
  console.log('Scope requested: https://www.googleapis.com/auth/drive.file (Only files created by Ditto)\n');

  const existingState = store.loadState();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    const defaultClientId = existingState?.oauth?.clientId || '';
    const defaultSecret = existingState?.oauth?.clientSecret || '';

    const promptId = defaultClientId ? `Google Cloud Client ID [${defaultClientId}]: ` : 'Google Cloud Client ID: ';
    let clientId = (await rl.question(promptId)).trim();
    if (!clientId && defaultClientId) clientId = defaultClientId;

    const promptSecret = defaultSecret ? `Google Cloud Client Secret [hidden]: ` : 'Google Cloud Client Secret: ';
    let clientSecret = (await rl.question(promptSecret)).trim();
    if (!clientSecret && defaultSecret) clientSecret = defaultSecret;

    if (!clientId || !clientSecret) {
      console.error('\nError: Both Client ID and Client Secret are required.');
      process.exit(1);
    }

    console.log('\nOpening your browser for Google authentication...');
    const tokens = await OAuthManager.authenticate(clientId, clientSecret, { openBrowser: true });

    console.log('Verifying Google Drive storage...');
    const authClient = OAuthManager.createClient(clientId, clientSecret, tokens);
    const driveManager = new DriveManager(authClient);

    const canonicalFile = await driveManager.getOrCreateCanonicalFile(existingState?.drive?.fileId);

    const newState: DittoState = {
      version: '1.0.0',
      oauth: {
        clientId,
        clientSecret,
        tokens,
      },
      drive: canonicalFile,
    };

    store.saveState(newState);

    console.log('\n✓ Authorization successful!');
    console.log(`✓ Canonical Drive file ready: ${canonicalFile.fileName} (${canonicalFile.fileId})`);
    console.log(`✓ Permanent Test Link: ${canonicalFile.webViewLink}\n`);
  } catch (err) {
    const error = err as Error;
    console.error(`\nAuthorization failed: ${error.message}`);
    process.exit(1);
  } finally {
    rl.close();
  }
}

async function handleDeliver(store: StateStore, args: string[]): Promise<void> {
  const options = parseArgs({
    args,
    options: {
      json: { type: 'boolean', default: false },
      task: { type: 'string', default: 'assembleDebug' },
      dir: { type: 'string', default: process.cwd() },
      'skip-build': { type: 'boolean', default: false },
    },
    allowPositionals: true,
  });

  const isJson = options.values.json;
  const projectDir = options.values.dir as string;
  const task = options.values.task as string;
  const skipBuild = options.values['skip-build'] as boolean;

  const logInfo = (msg: string) => {
    if (isJson) {
      process.stderr.write(`${msg}\n`);
    } else {
      console.log(msg);
    }
  };

  const outputError = (msg: string) => {
    if (isJson) {
      const errRes: DeliveryResult = { status: 'error', error: msg };
      process.stdout.write(JSON.stringify(errRes, null, 2) + '\n');
    } else {
      console.error(`\nError: ${msg}\n`);
    }
    process.exit(1);
  };

  const state = store.loadState();
  if (!state || !state.oauth?.tokens) {
    return outputError("Ditto is not authorized. Please run 'ditto auth' first.");
  }

  try {
    await store.withLock(async () => {
      // 1. Detect Android Project
      logInfo('🔍 Detecting Android project...');
      const project = GradleDetector.detect(projectDir);
      logInfo(`✓ Found Android project: ${project.projectName} (${project.projectRoot})`);

      const buildStartTime = Date.now();
      let buildDurationSec = 0;

      // 2. Build APK
      if (!skipBuild) {
        logInfo(`⚙️ Running Gradle task '${task}'...`);
        const buildResult = await BuildRunner.build(project, {
          task,
          onProgress: (chunk) => {
            if (!isJson) process.stderr.write(chunk);
          },
        });
        buildDurationSec = buildResult.durationSeconds;
        logInfo(`✓ Gradle build succeeded in ${buildDurationSec}s`);
      } else {
        logInfo('⏩ Skipping build step (--skip-build specified)');
      }

      // 3. Inspect generated APK
      logInfo('📦 Locating generated debug APK...');
      const apkPath = ApkParser.findApk(project.projectRoot, buildStartTime);
      const meta = ApkParser.parseApk(apkPath, project.projectRoot);
      logInfo(`✓ Found APK: ${meta.fileName} (${meta.sizeMb} MB)`);
      logInfo(`  Package: ${meta.packageName} | Version: ${meta.versionName} (${meta.versionCode})`);

      // 4. Connect to Google Drive
      logInfo('☁️ Connecting to Google Drive...');
      const authClient = OAuthManager.createClient(
        state.oauth.clientId,
        state.oauth.clientSecret,
        state.oauth.tokens!,
        (updatedTokens) => {
          state.oauth.tokens = updatedTokens;
          store.saveState(state);
        }
      );

      const driveManager = new DriveManager(authClient);
      const canonicalFile = await driveManager.getOrCreateCanonicalFile(state.drive?.fileId);

      // 5. Overwrite file in place
      logInfo(`🚀 Uploading & overwriting '${canonicalFile.fileName}' on Google Drive...`);
      const uploadRes = await driveManager.uploadApk(canonicalFile.fileId, meta.apkPath);
      logInfo(`✓ Overwrite completed in ${uploadRes.durationSeconds}s`);

      // 6. Update local state
      state.drive = {
        ...canonicalFile,
        webViewLink: uploadRes.webViewLink,
        webContentLink: uploadRes.webContentLink,
        lastUploadedAt: new Date().toISOString(),
        lastProject: project.projectName,
        lastPackageName: meta.packageName,
        lastVersionName: meta.versionName,
        lastVersionCode: meta.versionCode,
        lastSha256: meta.sha256,
        lastSizeBytes: meta.sizeBytes,
      };
      store.saveState(state);

      // 7. Output result
      const result: DeliveryResult = {
        status: 'success',
        project: {
          name: project.projectName,
          root: project.projectRoot,
          packageName: meta.packageName,
          versionName: meta.versionName,
          versionCode: meta.versionCode,
        },
        artifact: {
          fileName: canonicalFile.fileName,
          sizeMb: meta.sizeMb,
          sha256: meta.sha256,
          buildDurationSec,
          uploadDurationSec: uploadRes.durationSeconds,
        },
        drive: {
          fileId: canonicalFile.fileId,
          webViewUrl: uploadRes.webViewLink,
          directDownloadUrl: uploadRes.webContentLink,
          overwritten: true,
        },
      };

      if (isJson) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      } else {
        console.log('\n=========================================');
        console.log('📲 ANDROID DEBUG BUILD READY FOR TESTING');
        console.log('=========================================');
        console.log(`Project:        ${project.projectName}`);
        console.log(`Package ID:     ${meta.packageName}`);
        console.log(`Version:        ${meta.versionName} (Build ${meta.versionCode})`);
        console.log(`APK Size:       ${meta.sizeMb} MB`);
        console.log(`SHA-256:        ${meta.sha256.substring(0, 16)}...`);
        console.log('-----------------------------------------');
        console.log(`Permanent Link: ${uploadRes.webViewLink}`);
        console.log('=========================================\n');
      }
    });
  } catch (err) {
    const error = err as Error;
    outputError(error.message);
  }
}

async function handleStatus(store: StateStore, args: string[]): Promise<void> {
  const options = parseArgs({
    args,
    options: {
      json: { type: 'boolean', default: false },
    },
    allowPositionals: true,
  });

  const state = store.loadState();
  if (options.values.json) {
    process.stdout.write(JSON.stringify(state || {}, null, 2) + '\n');
    return;
  }

  console.log('\n=== Ditto Status ===\n');
  if (!state) {
    console.log('Ditto is not configured yet. Run \'ditto auth\' to get started.\n');
    return;
  }

  console.log(`Auth Status:       ${state.oauth?.tokens ? 'Authenticated ✓' : 'Not Authenticated ✗'}`);
  console.log(`Client ID:         ${state.oauth?.clientId ? state.oauth.clientId.substring(0, 15) + '...' : 'None'}`);

  if (state.drive) {
    console.log('\n--- Canonical Drive File ---');
    console.log(`File Name:         ${state.drive.fileName}`);
    console.log(`File ID:           ${state.drive.fileId}`);
    console.log(`Permanent Link:    ${state.drive.webViewLink}`);
    console.log(`Direct Download:   ${state.drive.webContentLink}`);

    if (state.drive.lastUploadedAt) {
      console.log('\n--- Last Delivered Build ---');
      console.log(`Last Project:      ${state.drive.lastProject || 'N/A'}`);
      console.log(`Package Name:      ${state.drive.lastPackageName || 'N/A'}`);
      console.log(`Version:           ${state.drive.lastVersionName} (Build ${state.drive.lastVersionCode})`);
      console.log(`Delivered At:      ${new Date(state.drive.lastUploadedAt).toLocaleString()}`);
      console.log(`SHA-256:           ${state.drive.lastSha256 || 'N/A'}`);
    }
  }
  console.log();
}

async function handleDoctor(store: StateStore): Promise<void> {
  console.log('\n=== Ditto Environment Doctor ===\n');

  console.log(`[1] Node.js Version: ${process.version} (>= 18 required) ✓`);

  // Check state store
  const state = store.loadState();
  if (state?.oauth?.tokens) {
    console.log(`[2] Ditto State: Configured at ${store.getStateFilePath()} ✓`);
    console.log(`[3] Google Drive Auth: Connected with Client ID (${state.oauth.clientId.substring(0, 12)}...) ✓`);
    if (state.drive?.fileId) {
      console.log(`[4] Canonical File: ${state.drive.fileId} (${state.drive.fileName}) ✓`);
    } else {
      console.log(`[4] Canonical File: Not initialized yet (will be created on first deliver) ⚠️`);
    }
  } else {
    console.log(`[2] Ditto State: Not configured ⚠️  (Run 'ditto auth')`);
  }

  console.log('\nAll core diagnostics complete.\n');
}

function printHelp(): void {
  console.log(`
Ditto 📲 - Android Debug APK Delivery Automation

Usage:
  ditto <command> [options]

Commands:
  auth                 Configure Google Cloud OAuth credentials and log in
  deliver [options]    Build debug APK, inspect metadata, overwrite Drive APK, and return link
  status [options]     Display current configuration and last delivered build
  doctor               Diagnose environment, configuration, and connectivity
  help                 Display this help menu

Options for 'deliver':
  --json               Output machine-readable JSON to stdout (for AI agents)
  --task <name>        Gradle task to execute (default: 'assembleDebug')
  --dir <path>         Target Android project directory (default: current directory)
  --skip-build         Skip Gradle build and upload existing latest APK
`);
}
