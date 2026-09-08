#!/usr/bin/env node
/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：维护fw相关的项目配置与工程说明。
 */
import { main } from './src/interfaces/runner/Cli.ts';
import { translateLegacyArgs } from './src/interfaces/runner/Compat.ts';

try {
  await main(translateLegacyArgs(process.argv.slice(2)));
} catch (error) {
  process.stderr.write(`fw error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
