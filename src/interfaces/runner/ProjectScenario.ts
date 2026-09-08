/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：提供项目Scenario的外部入口、参数转换与响应处理。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseProjectScenario } from '../../application/services/ProjectScenario.ts';

/** 加载项目Scenario。 */
export function loadProjectScenario(path: string, repositoryRoot?: string) {
  return parseProjectScenario(JSON.parse(readFileSync(resolve(path), 'utf8')),
    repositoryRoot ? resolve(repositoryRoot) : undefined);
}
