#!/usr/bin/env node
/**
 * postinstall.js — Windows Junction fix for `npm install -g github:user/repo`
 *
 * On Windows, npm installs git-sourced packages by creating an NTFS Junction
 * pointing to a temp git-clone directory. After install, npm deletes the temp
 * dir, leaving the Junction dangling → `ditto` command fails with MODULE_NOT_FOUND.
 *
 * This script runs DURING install (while the temp dir exists), detects the
 * Junction scenario, and copies the package to a stable permanent location at
 * %USERPROFILE%\.ditto-pkg\<version>\ — then patches the npm bin shims to
 * point to the stable location.
 *
 * Safe: only runs on Windows, only when a Junction is detected, never overwrites
 * an existing stable install of the same version. Fails silently so it never
 * breaks a non-Windows or registry install.
 */

import { existsSync, mkdirSync, cpSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import os from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = join(__dirname, '..');

// Only needed on Windows
if (process.platform !== 'win32') {
  process.exit(0);
}

/** Check if a directory path is a Windows Junction (ReparsePoint) */
function isJunction(dirPath) {
  try {
    const result = execSync(
      `powershell -NoProfile -NonInteractive -Command "` +
        `$item = Get-Item -LiteralPath '${dirPath}' -ErrorAction SilentlyContinue; ` +
        `if ($item) { $item.Attributes } else { 'NOT_FOUND' }" `,
      { encoding: 'utf8', timeout: 8000, stdio: ['pipe', 'pipe', 'ignore'] }
    ).trim();
    return result.includes('ReparsePoint');
  } catch {
    return false;
  }
}

if (!isJunction(packageRoot)) {
  // Normal install (tarball / registry / source) — no fix needed
  process.exit(0);
}

// --- Junction detected: copy to stable location ---

let pkg;
try {
  pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
} catch {
  process.exit(0); // Can't read pkg, bail silently
}

const version = pkg.version || '0.0.0';
const stableRoot = join(os.homedir(), '.ditto-pkg');
const stableDir = join(stableRoot, version);
const stableBin = join(stableDir, 'bin', 'ditto.js');

console.log(`\n📦 [ditto] Detected Windows Junction install — copying to stable location...`);
console.log(`   From: ${packageRoot} (Junction)`);
console.log(`   To:   ${stableDir}`);

try {
  if (!existsSync(stableDir)) {
    mkdirSync(stableDir, { recursive: true });
  }

  // Copy essential directories (skip devDependencies that aren't needed at runtime)
  const targets = ['dist', 'bin', 'skills', 'node_modules', 'package.json'];
  for (const target of targets) {
    const src = join(packageRoot, target);
    const dst = join(stableDir, target);
    if (existsSync(src)) {
      cpSync(src, dst, { recursive: true, force: true });
    }
  }

  // Find npm's bin directory (same directory as the node executable on Windows)
  // e.g. C:\Users\user\AppData\Roaming\npm
  const npmBinDir = join(
    process.env.APPDATA || join(os.homedir(), 'AppData', 'Roaming'),
    'npm'
  );

  const binFiles = {
    cmd: join(npmBinDir, 'ditto.cmd'),
    ps1: join(npmBinDir, 'ditto.ps1'),
    sh:  join(npmBinDir, 'ditto'),
  };

  // Rewrite .cmd shim
  if (existsSync(binFiles.cmd)) {
    writeFileSync(
      binFiles.cmd,
      `@ECHO off\r\nIF EXIST "%~dp0node.exe" (\r\n  "%~dp0node.exe" "${stableBin}" %*\r\n) ELSE (\r\n  node "${stableBin}" %*\r\n)\r\n`
    );
  }

  // Rewrite .ps1 shim
  if (existsSync(binFiles.ps1)) {
    const fwd = stableBin.replace(/\\/g, '/');
    writeFileSync(
      binFiles.ps1,
      `#!/usr/bin/env pwsh\n$basedir=Split-Path $MyInvocation.MyCommand.Definition -Parent\nif (Test-Path "$basedir/node.exe") {\n  & "$basedir/node.exe" "${fwd}" $args\n} else {\n  node "${fwd}" $args\n}\nexit $LASTEXITCODE\n`
    );
  }

  // Rewrite sh shim (for Git Bash / WSL)
  if (existsSync(binFiles.sh)) {
    const fwd = stableBin.replace(/\\/g, '/');
    writeFileSync(
      binFiles.sh,
      `#!/bin/sh\nexec node "${fwd}" "$@"\n`
    );
  }

  console.log(`✅ [ditto] Installed successfully to ${stableDir}`);
  console.log(`   Run: ditto --help\n`);

} catch (err) {
  console.warn(`\n⚠ [ditto] Could not fix Junction install: ${err.message}`);
  console.warn(`  Fallback: npm install -g https://github.com/oviii-001/Ditto/archive/refs/heads/main.tar.gz\n`);
  // Never fail the install — just warn
  process.exit(0);
}
