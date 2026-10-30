#!/usr/bin/env node

import { runCli } from '../dist/cli.js';

runCli().catch((err) => {
  console.error(`Fatal Error: ${err.message}`);
  process.exit(1);
});
