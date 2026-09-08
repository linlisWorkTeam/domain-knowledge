/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：维护Playwrightconfig相关的项目配置与工程说明。
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // 保留既有截图基线目录，避免源文件改名重新生成验收图片。
  snapshotPathTemplate: '{testDir}/console.spec.ts-snapshots/{arg}{-projectName}{-platform}{ext}',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    ...devices['Desktop Chrome'],
    locale: 'zh-CN',
    colorScheme: 'dark',
    trace: 'retain-on-failure',
  },
});
