#!/usr/bin/env node
/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：提供UiAPI的外部入口、参数转换与响应处理。
 */
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { startKnowledgeServer } from '../runner/Server.ts';

/** 统一导出本模块的公共符号，供其他层通过明确入口引用。 */
export {
  createKnowledgeServer,
  mapHttpError,
  resolveServerBinding,
  startKnowledgeServer,
} from '../runner/Server.ts';
/** 统一导出本模块对外使用的类型契约。 */
/** 统一导出本模块的公共符号，供其他层通过明确入口引用。 */
export type { ServerBinding } from '../runner/Server.ts';

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  startKnowledgeServer();
}
