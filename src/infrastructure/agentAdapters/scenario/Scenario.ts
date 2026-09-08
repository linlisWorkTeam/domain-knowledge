/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：提供Scenario的基础设施实现与外部系统接入。
 */
import Ajv2020Import from 'ajv/dist/2020.js';
import type { AgentProvider, AgentRequest } from '../../../application/ports/ApplicationPorts.ts';

/** 定义Scenario响应的数据结构与类型约束。 */
export interface ScenarioResponse {
  /** 提供role信息，供调用方读取或传入。 */
  role: string;
  /** 提供输出信息，供调用方读取或传入。 */
  output: Record<string, unknown>;
}

const Ajv2020 = Ajv2020Import as unknown as new (options: Record<string, unknown>) => {
  compile(schema: Record<string, unknown>): {
    (value: unknown): boolean;
    errors?: unknown;
  };
  errorsText(errors: unknown): string;
};

/** 封装SchemaValidatedScenario角色的对外操作与协作依赖。 */
export class SchemaValidatedScenarioAgent implements AgentProvider {
  /** 提供responses信息，供调用方读取或传入。 */
  readonly responses: ScenarioResponse[];
  /** 提供requests信息，供调用方读取或传入。 */
  readonly requests: AgentRequest[] = [];
  private cursor = 0;

  /** 注入协作依赖并初始化实例状态。 */
  constructor(responses: ScenarioResponse[]) {
    this.responses = structuredClone(responses);
  }

  /** 运行请求。 */
  async run(request: AgentRequest, signal?: AbortSignal): Promise<Record<string, unknown>> {
    if (signal?.aborted) throw new Error('AGENT_CANCELLED');
    this.requests.push(structuredClone(request));
    const fixture = this.responses[this.cursor];
    if (!fixture) throw new Error(`SCENARIO_EXHAUSTED: unexpected ${request.role}`);
    if (fixture.role !== request.role) {
      throw new Error(`SCENARIO_ROLE_MISMATCH: expected ${fixture.role}, got ${request.role}`);
    }
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    const validate = ajv.compile(request.outputSchema);
    if (!validate(fixture.output)) {
      throw new Error(`AGENT_OUTPUT_INVALID: ${ajv.errorsText(validate.errors)}`);
    }
    this.cursor += 1;
    return structuredClone(fixture.output);
  }

  /** 校验Consumed。 */
  assertConsumed(): void {
    if (this.cursor !== this.responses.length) {
      throw new Error(`SCENARIO_INCOMPLETE: consumed ${this.cursor}/${this.responses.length}`);
    }
  }
}
