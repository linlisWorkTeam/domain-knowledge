/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：提供领域角色执行入口，将内部注册与角色实现封装在 Domain 内。
 */
import { agents } from '../../agents/AgentRegistry.ts';
import { assertActive, type ExecutionContext, type RoleInput, type RoleResult } from '../../agents/AgentExecution.ts';

/** 调用方提供经版本化契约校验的命令和可信材料；服务不持久化、不决定发布或调度图。 */
export async function executeAgent(
  input: RoleInput<Record<string, unknown>>,
  context: ExecutionContext,
): Promise<RoleResult<unknown>> {
  assertActive(context.signal);
  const role = context.command.agentType;
  if (!Object.hasOwn(agents, role)) throw new Error(`AGENT_ROLE_UNKNOWN: ${role}`);
  // 各角色保留专属输入类型，类型收窄只发生在领域对外执行边界。
  const execute = agents[role].execute as unknown as (
    input: RoleInput<Record<string, unknown>>, context: ExecutionContext,
  ) => Promise<RoleResult<unknown>>;
  return execute(input, context);
}
