/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：提供Dsh的外部入口、参数转换与响应处理。
 */
/** 定义知识API客户端选项的数据结构与类型约束。 */
export interface KnowledgeApiClientOptions {
  /** 提供基础URL信息，供调用方读取或传入。 */
  baseUrl: string;
  /** 提供写入令牌信息，供调用方读取或传入。 */
  writeToken?: string;
  /** 提供HTTP 请求实现信息，供调用方读取或传入。 */
  fetchImpl?: typeof fetch;
}

/** 封装知识API客户端的对外操作与协作依赖。 */
export class KnowledgeApiClient {
  /** 提供基础URL信息，供调用方读取或传入。 */
  readonly baseUrl: string;
  /** 提供写入令牌信息，供调用方读取或传入。 */
  readonly writeToken?: string;
  /** 提供HTTP 请求实现信息，供调用方读取或传入。 */
  readonly fetchImpl: typeof fetch;

  /** 注入协作依赖并初始化实例状态。 */
  constructor(options: KnowledgeApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.writeToken = options.writeToken;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /** 读取指定 API 资源并返回结构化 JSON 响应。 */
  async get(path: string): Promise<Record<string, unknown>> {
    return this.request('GET', path);
  }

  /** 使用写入令牌提交业务载荷，可携带幂等键避免重复写入。 */
  async post(
    path: string,
    payload: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<Record<string, unknown>> {
    if (!this.writeToken) throw new Error('DSH_ADAPTER_WRITE_DISABLED: configure writeToken');
    return this.request('POST', path, payload, idempotencyKey);
  }

  private async request(
    method: string,
    path: string,
    payload?: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<Record<string, unknown>> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        accept: 'application/json',
        ...(payload ? { 'content-type': 'application/json' } : {}),
        ...(this.writeToken ? { authorization: `Bearer ${this.writeToken}` } : {}),
        ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
      },
      body: payload ? JSON.stringify(payload) : undefined,
      signal: AbortSignal.timeout(180_000),
    });
    const body = await response.json() as Record<string, unknown>;
    if (!response.ok) throw new Error(`KNOWLEDGE_API_${response.status}: ${JSON.stringify(body)}`);
    return body;
  }
}

/** 创建Dsh工具Definitions。 */
export function createDshToolDefinitions(client: KnowledgeApiClient) {
  return [
    {
      name: 'wp_knowledge_query',
      description: 'Read-only retrieval of behaviorally VERIFIED knowledge. Candidate knowledge is excluded by default.',
      parameters: {
        q: { type: 'string', required: true },
        limit: { type: 'number' },
        status: { type: 'string', enum: ['VERIFIED', 'CANDIDATE', 'SUPERSEDED'] },
      },
      execute: (args: Record<string, unknown>) => client.get(
        `/api/v1/knowledge?q=${encodeURIComponent(String(args.q ?? ''))}` +
        `&limit=${encodeURIComponent(String(args.limit ?? 8))}` +
        `&status=${encodeURIComponent(String(args.status ?? 'VERIFIED'))}`,
      ),
    },
    {
      name: 'wp_knowledge_status',
      description: 'Read the knowledge flywheel registry status.',
      parameters: {},
      execute: () => client.get('/api/v1/system/status'),
    },
    {
      name: 'wp_knowledge_scan',
      description: 'List changed Markdown sources from server-configured acquisition roots. The scan is read-only and does not schedule an Agent.',
      parameters: {},
      execute: () => client.get('/api/v1/sources/scan'),
    },
    {
      name: 'wp_knowledge_ingest_candidate',
      description: 'Submit candidate knowledge. Quality acceptance does not publish or behaviorally verify it.',
      parameters: {
        moduleId: { type: 'string', required: true },
        body: { type: 'string', required: true },
        title: { type: 'string' },
        description: { type: 'string' },
        category: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        provenance: { type: 'array', required: true, items: { type: 'object' } },
        idempotencyKey: { type: 'string', required: true },
      },
      execute: (args: Record<string, unknown>) => {
        const { idempotencyKey, ...payload } = args;
        return client.post('/api/v1/knowledge/candidates', payload, String(idempotencyKey));
      },
    },
    {
      name: 'wp_knowledge_feedback',
      description: 'Record usage feedback without modifying knowledge content or bypassing publication gates.',
      parameters: {
        versionId: { type: 'string', required: true },
        action: { type: 'string', required: true, enum: ['hit', 'rate', 'correct'] },
        rating: { type: 'number' },
        note: { type: 'string' },
        idempotencyKey: { type: 'string', required: true },
      },
      execute: (args: Record<string, unknown>) => {
        const { versionId, idempotencyKey, ...payload } = args;
        return client.post(
          `/api/v1/knowledge/${encodeURIComponent(String(versionId))}/feedback`,
          payload,
          String(idempotencyKey),
        );
      },
    },
  ];
}

/** 创建DshPlugin。 */
export function createDshPlugin(config: { baseUrl?: string; writeToken?: string } = {}) {
  return {
    name: '@linlis-workteam/wpknowledge-dsh-adapter',
    apply(context: Record<string, unknown>) {
      const runtimeHarness = (globalThis as Record<string, unknown>).harness as {
        defineTool(definition: Record<string, unknown>): unknown;
        registerTool(context: Record<string, unknown>, tool: unknown): void;
      } | undefined;
      if (!runtimeHarness) throw new Error('DSH_ADAPTER_UNAVAILABLE: harness tool registry not found');
      const client = new KnowledgeApiClient({
        baseUrl: config.baseUrl ?? process.env.WP_KNOWLEDGE_URL ?? 'http://127.0.0.1:4174',
        writeToken: config.writeToken ?? process.env.WP_KNOWLEDGE_WRITE_TOKEN,
      });
      for (const definition of createDshToolDefinitions(client)) {
        const tool = runtimeHarness.defineTool({
          ...definition,
          output: {
            schema: { type: 'object', additionalProperties: true },
            render: (_args: unknown, value: unknown) => [{ type: 'text', text: JSON.stringify(value) }],
          },
        });
        runtimeHarness.registerTool(context, tool);
      }
    },
  };
}

/** 导出本文件的默认配置或模块入口。 */
export default createDshPlugin();
