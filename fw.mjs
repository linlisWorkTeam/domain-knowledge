#!/usr/bin/env node
import { main } from './src/interfaces/runner/cli.ts';
import { translateLegacyArgs } from './src/interfaces/runner/compat.ts';

try {
  await main(translateLegacyArgs(process.argv.slice(2)));
} catch (error) {
  process.stderr.write(`fw error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
