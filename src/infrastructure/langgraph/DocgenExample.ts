/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：提供Docgen样例的基础设施实现与外部系统接入。
 */
/** Compatibility export; development runs no longer construct a workflow graph. */
/** 统一导出本模块的公共符号，供其他层通过明确入口引用。 */
export { executeDevelopmentStage as executeDocgenExample } from '../../application/services/AgentDevelopmentObserver.ts';
