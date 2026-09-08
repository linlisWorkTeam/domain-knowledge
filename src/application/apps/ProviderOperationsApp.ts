/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：协调提供方Operations应用用例及其依赖的领域规则与端口。
 */
import { randomUUID } from 'node:crypto';
import { assertInvariant, sha256 } from '../../domain/Domain.ts';
import type {
  ProviderConnectionProbe,
  ProviderEndpointPolicy,
  DshExecutionParameters,
  DshRuntimeConfiguration,
  ProviderSettingsRecord,
  ProviderSettingsStore,
  RunConfigurationSnapshot,
} from '../ports/ApplicationPorts.ts';

/** 定义提供方设置视图的数据结构与类型约束。 */
export interface ProviderSettingsView {
  /** 提供提供方信息，供调用方读取或传入。 */
  provider: ProviderSettingsRecord['provider'];
  /** 提供APIURLMasked信息，供调用方读取或传入。 */
  apiUrlMasked: string | null;
  /** 提供API键Configured信息，供调用方读取或传入。 */
  apiKeyConfigured: boolean;
  /** 提供模型信息，供调用方读取或传入。 */
  model: string | null;
  /** 提供启用状态信息，供调用方读取或传入。 */
  enabled: boolean;
  /** 提供修订号信息，供调用方读取或传入。 */
  revision: number;
  /** 提供verification信息，供调用方读取或传入。 */
  verification: {
    status: ProviderSettingsRecord['verificationStatus'];
    reasonCode: string;
    checkedAt: string | null;
  };
  /** 提供更新时间信息，供调用方读取或传入。 */
  updatedAt: string | null;
}

interface ProviderAuditEvent {
  /** 提供event标识信息，供调用方读取或传入。 */
  eventId: string;
  /** 提供event类型信息，供调用方读取或传入。 */
  eventType: 'ComponentStatusChanged';
  /** 提供occurred时间信息，供调用方读取或传入。 */
  occurredAt: string;
  /** 提供业务载荷信息，供调用方读取或传入。 */
  payload: Record<string, unknown>;
}

function maskApiUrl(raw: string): string {
  const url = new URL(raw);
  const path = url.pathname === '/' ? '' : '/…';
  return `${url.protocol}//${url.host}${path}`;
}

function settingsFingerprint(record: Pick<ProviderSettingsRecord, 'provider' | 'apiUrl' | 'apiKey' | 'model'>): string {
  return sha256(JSON.stringify({
    provider: record.provider,
    apiUrl: record.apiUrl,
    apiKeySha256: record.apiKey === null ? null : sha256(record.apiKey),
    model: record.model,
  }));
}

function runtimeDigest(
  record: ProviderSettingsRecord,
  execution: DshExecutionParameters,
): string {
  // Credentials and the mutable settings revision are intentionally excluded. A
  // rotated, reverified key may resume a Run; endpoint/model changes may not.
  return sha256(JSON.stringify({
    provider: record.provider,
    apiUrl: record.apiUrl,
    model: record.model,
    runtimeSha256: execution.runtimeSha256,
    api: execution.api,
    maxTokens: execution.maxTokens,
    maxSchemaAttempts: execution.maxSchemaAttempts,
    contextWindow: execution.contextWindow,
  }));
}

/** 封装提供方Operations应用的对外操作与协作依赖。 */
export class ProviderOperationsApp {
  /** 提供store信息，供调用方读取或传入。 */
  readonly store: ProviderSettingsStore;
  /** 提供endpoint策略信息，供调用方读取或传入。 */
  readonly endpointPolicy: ProviderEndpointPolicy;
  /** 提供probe信息，供调用方读取或传入。 */
  readonly probe: ProviderConnectionProbe;
  /** 提供 时钟 对应的时钟操作。 */
  readonly clock: () => string;
  /** 提供 audit 对应的audit操作。 */
  readonly audit: (event: ProviderAuditEvent) => void;
  /** 提供verification最大Age毫秒信息，供调用方读取或传入。 */
  readonly verificationMaxAgeMs: number;
  /** 提供executionParameters信息，供调用方读取或传入。 */
  readonly executionParameters: DshExecutionParameters;
  private readonly frozenConfigurations = new Map<string, DshRuntimeConfiguration>();
  private mutationTail: Promise<void> = Promise.resolve();

  /** 注入协作依赖并初始化实例状态。 */
  constructor(input: {
    store: ProviderSettingsStore;
    endpointPolicy: ProviderEndpointPolicy;
    probe: ProviderConnectionProbe;
    executionParameters: DshExecutionParameters;
    clock?: () => string;
    audit?: (event: ProviderAuditEvent) => void;
    verificationMaxAgeMs?: number;
  }) {
    this.store = input.store;
    this.endpointPolicy = input.endpointPolicy;
    this.probe = input.probe;
    assertInvariant(input.executionParameters.api === 'openai-completions',
      'DSH_API_INVALID: only openai-completions is supported');
    assertInvariant(Number.isSafeInteger(input.executionParameters.maxTokens)
      && input.executionParameters.maxTokens > 0,
    'DSH_MAX_TOKENS_INVALID: maxTokens must be a positive integer');
    assertInvariant(Number.isSafeInteger(input.executionParameters.maxSchemaAttempts)
      && input.executionParameters.maxSchemaAttempts >= 1
      && input.executionParameters.maxSchemaAttempts <= 3,
    'DSH_MAX_SCHEMA_ATTEMPTS_INVALID: maxSchemaAttempts must be 1..3');
    assertInvariant(Number.isSafeInteger(input.executionParameters.contextWindow)
      && input.executionParameters.contextWindow >= input.executionParameters.maxTokens,
    'DSH_CONTEXT_WINDOW_INVALID: contextWindow must be at least maxTokens');
    this.executionParameters = structuredClone(input.executionParameters);
    this.clock = input.clock ?? (() => new Date().toISOString());
    this.audit = input.audit ?? (() => undefined);
    this.verificationMaxAgeMs = input.verificationMaxAgeMs ?? 24 * 60 * 60_000;
  }

  /** 读取设置。 */
  getSettings(): ProviderSettingsView {
    return this.view(this.store.load());
  }

  /** 读取状态。 */
  getStatus(fallback: { provider: string; model: string }): Record<string, unknown> {
    const checkedAt = this.clock();
    const record = this.store.load();
    if (!record) {
      return fallback.provider === 'fixture'
        ? {
            provider: fallback.provider,
            availability: 'DEGRADED',
            authentication: 'NOT_CONFIGURED',
            model: fallback.model,
            configured: false,
            enabled: false,
            checkedAt,
            reasonCode: 'FIXTURE_PROVIDER',
          }
        : {
            provider: fallback.provider,
            availability: 'UNKNOWN',
            authentication: 'UNVERIFIED',
            model: fallback.model,
            configured: true,
            enabled: true,
            checkedAt,
            reasonCode: 'ENVIRONMENT_PROVIDER_UNVERIFIED',
          };
    }
    if (record.provider === 'pi-agent') return { provider: record.provider, availability: 'UNAVAILABLE', authentication: 'UNVERIFIED', model: record.model, configured: true, enabled: false, checkedAt, reasonCode: 'PROVIDER_MIGRATION_REQUIRED' };
    const verified = record.verificationStatus === 'VERIFIED'
      && record.verifiedFingerprint === settingsFingerprint(record);
    const fresh = verified && this.verificationIsFresh(record, checkedAt);
    return {
      provider: record.provider,
      availability: fresh && record.enabled ? 'AVAILABLE'
        : record.verificationStatus === 'FAILED' ? 'UNAVAILABLE' : 'DEGRADED',
      authentication: fresh ? 'AUTHENTICATED'
        : record.verificationStatus === 'FAILED' ? 'FAILED' : 'UNVERIFIED',
      model: record.model,
      configured: true,
      enabled: fresh && record.enabled,
      checkedAt,
      reasonCode: verified && !fresh ? 'VERIFICATION_EXPIRED' : verified
        ? record.enabled ? 'READY' : 'VERIFIED_DISABLED'
        : record.verificationReasonCode,
    };
  }

  /** 保存请求。 */
  async put(input: {
    provider: unknown;
    apiUrl: unknown;
    apiKey?: unknown;
    clearApiKey?: unknown;
    model?: unknown;
    expectedRevision: unknown;
  }): Promise<Record<string, unknown>> {
    return this.serialized(() => this.putUnlocked(input));
  }

  private async putUnlocked(input: {
    provider: unknown;
    apiUrl: unknown;
    apiKey?: unknown;
    clearApiKey?: unknown;
    model?: unknown;
    expectedRevision: unknown;
  }): Promise<Record<string, unknown>> {
    assertInvariant(input.provider === 'deepseek-harness', 'PROVIDER_UNSUPPORTED: provider must be deepseek-harness');
    assertInvariant(typeof input.apiUrl === 'string' && input.apiUrl.trim().length > 0,
      'PROVIDER_URL_INVALID: apiUrl is required');
    assertInvariant(Number.isSafeInteger(input.expectedRevision) && Number(input.expectedRevision) >= 0,
      'REVISION_INVALID: expectedRevision must be a non-negative integer');
    assertInvariant(input.clearApiKey === undefined || typeof input.clearApiKey === 'boolean',
      'PROVIDER_SETTINGS_INVALID: clearApiKey must be boolean');
    assertInvariant(!(input.clearApiKey === true && input.apiKey !== undefined),
      'PROVIDER_SETTINGS_INVALID: apiKey and clearApiKey are mutually exclusive');
    if (input.apiKey !== undefined) {
      assertInvariant(typeof input.apiKey === 'string' && input.apiKey.length >= 1 && input.apiKey.length <= 16_384,
        'PROVIDER_KEY_INVALID: apiKey must contain 1..16384 characters');
      assertInvariant(!/[\0\r\n]/.test(input.apiKey as string),
        'PROVIDER_KEY_INVALID: apiKey contains forbidden control characters');
    }
    if (input.model !== undefined && input.model !== null) {
      assertInvariant(typeof input.model === 'string' && input.model.trim().length > 0
        && input.model.length <= 256 && !/[\0\r\n]/.test(input.model),
      'PROVIDER_MODEL_INVALID: model is invalid');
    }
    const current = this.store.load();
    const expectedRevision = Number(input.expectedRevision);
    assertInvariant((current?.revision ?? 0) === expectedRevision,
      'REVISION_CONFLICT: Provider settings changed');
    const endpoint = await this.endpointPolicy.validate(input.apiUrl);
    const apiKey = input.clearApiKey === true
      ? null
      : input.apiKey === undefined ? (current?.provider === 'deepseek-harness' ? current.apiKey : null) : String(input.apiKey);
    const now = this.clock();
    const next: ProviderSettingsRecord = {
      provider: 'deepseek-harness',
      apiUrl: endpoint.url.toString(),
      apiKey,
      model: input.model === undefined ? current?.model ?? null
        : input.model === null ? null : String(input.model).trim(),
      enabled: false,
      revision: expectedRevision + 1,
      verificationStatus: 'UNVERIFIED',
      verificationReasonCode: 'VERIFICATION_REQUIRED',
      lastVerifiedAt: null,
      verifiedFingerprint: null,
      updatedAt: now,
    };
    this.store.save(next);
    const eventId = `provider_event_${randomUUID()}`;
    this.audit({
      eventId,
      eventType: 'ComponentStatusChanged',
      occurredAt: now,
      payload: {
        provider: next.provider,
        component: 'provider',
        changeType: 'SETTINGS_CHANGED',
        apiUrlOrigin: endpoint.url.origin,
        model: next.model,
        apiKeyConfigured: next.apiKey !== null,
        revision: next.revision,
      },
    });
    return {
      resourceId: 'deepseek-harness',
      eventId,
      revision: next.revision,
      acceptedAt: now,
      settings: this.view(next),
    };
  }

  /** 验证请求。 */
  async verify(input: { expectedRevision: unknown; enable?: unknown }): Promise<Record<string, unknown>> {
    return this.serialized(() => this.verifyUnlocked(input));
  }

  private async verifyUnlocked(input: {
    expectedRevision: unknown;
    enable?: unknown;
  }): Promise<Record<string, unknown>> {
    assertInvariant(Number.isSafeInteger(input.expectedRevision) && Number(input.expectedRevision) > 0,
      'REVISION_INVALID: expectedRevision must be a positive integer');
    assertInvariant(input.enable === undefined || typeof input.enable === 'boolean',
      'PROVIDER_SETTINGS_INVALID: enable must be boolean');
    const current = this.store.load();
    assertInvariant(current !== null, 'PROVIDER_SETTINGS_REQUIRED: save Provider settings first');
    assertInvariant(current.provider === 'deepseek-harness', 'PROVIDER_MIGRATION_REQUIRED: save and verify DSH configuration');
    assertInvariant(current.revision === Number(input.expectedRevision),
      'REVISION_CONFLICT: Provider settings changed');
    // Resolve again immediately before probing. This closes the save/verify DNS rebinding gap.
    const endpoint = await this.endpointPolicy.validate(current.apiUrl);
    const result = await this.probe.verify({
      endpoint,
      apiKey: current.apiKey,
      model: current.model,
    });
    const now = this.clock();
    const succeeded = result.status === 'VERIFIED';
    const next: ProviderSettingsRecord = {
      ...current,
      model: succeeded ? result.model : current.model,
      enabled: succeeded && input.enable !== false,
      revision: current.revision + 1,
      verificationStatus: result.status,
      verificationReasonCode: result.reasonCode,
      lastVerifiedAt: now,
      verifiedFingerprint: succeeded ? settingsFingerprint({ ...current, model: result.model }) : null,
      updatedAt: now,
    };
    this.store.save(next);
    const eventId = `provider_event_${randomUUID()}`;
    this.audit({
      eventId,
      eventType: 'ComponentStatusChanged',
      occurredAt: now,
      payload: {
        provider: next.provider,
        component: 'provider',
        changeType: 'VERIFICATION_COMPLETED',
        model: next.model,
        status: next.verificationStatus,
        reasonCode: next.verificationReasonCode,
        enabled: next.enabled,
        revision: next.revision,
      },
    });
    return {
      resourceId: 'deepseek-harness',
      eventId,
      revision: next.revision,
      acceptedAt: now,
      status: next.verificationStatus,
      reasonCode: next.verificationReasonCode,
      model: next.model,
      checkedAt: now,
      enabled: next.enabled,
    };
  }

  /** 运行配置提供方。 */
  runConfigurationProvider(fallback: RunConfigurationSnapshot['provider']): RunConfigurationSnapshot['provider'] {
    const current = this.store.load();
    if (!current) return structuredClone(fallback);
    if (current.provider !== 'deepseek-harness') throw new Error('PROVIDER_MIGRATION_REQUIRED: legacy configuration cannot start a new Run');
    if (!this.isEnabledAndVerified(current)) throw new Error('DSH_CONFIGURATION_UNAVAILABLE: save and verify DSH configuration');
    this.frozenConfigurations.set(runtimeDigest(current, this.executionParameters), { settings: structuredClone(current), ...structuredClone(this.executionParameters) });
    return {
      kind: 'deepseek-harness',
      model: current.model as string,
      parametersSha256: runtimeDigest(current, this.executionParameters),
    };
  }

  /** 提供 要求Runtime配置 对应的要求运行时配置操作。 */
  requireRuntimeConfiguration(
    expected: RunConfigurationSnapshot['provider'],
  ): DshRuntimeConfiguration {
    const current = this.store.load();
    const frozen = this.frozenConfigurations.get(expected.parametersSha256);
    if (expected.kind === 'deepseek-harness' && frozen?.settings.model === expected.model
      && (!current || !this.isEnabledAndVerified(current) || runtimeDigest(current, this.executionParameters) !== expected.parametersSha256)) return structuredClone(frozen);
    assertInvariant(current !== null && this.isEnabledAndVerified(current),
      'DSH_CONFIGURATION_UNAVAILABLE: verified Provider settings are required');
    assertInvariant(expected.kind === 'deepseek-harness'
      && expected.model === current.model
      && expected.parametersSha256 === runtimeDigest(current, this.executionParameters),
    'DSH_CONFIGURATION_CHANGED: Provider settings no longer match the Run snapshot');
    return {
      settings: structuredClone(current),
      ...structuredClone(this.executionParameters),
    };
  }

  private isEnabledAndVerified(record: ProviderSettingsRecord): boolean {
    return record.provider === 'deepseek-harness'
      && record.enabled
      && record.model !== null
      && record.verificationStatus === 'VERIFIED'
      && record.verifiedFingerprint === settingsFingerprint(record)
      && this.verificationIsFresh(record);
  }

  private verificationIsFresh(record: ProviderSettingsRecord, nowRaw = this.clock()): boolean {
    if (record.lastVerifiedAt === null) return false;
    const checkedAt = Date.parse(record.lastVerifiedAt);
    const now = Date.parse(nowRaw);
    return Number.isFinite(checkedAt) && Number.isFinite(now)
      && now >= checkedAt && now - checkedAt <= this.verificationMaxAgeMs;
  }

  private view(record: ProviderSettingsRecord | null): ProviderSettingsView {
    if (!record) {
      return {
        provider: 'deepseek-harness',
        apiUrlMasked: null,
        apiKeyConfigured: false,
        model: null,
        enabled: false,
        revision: 0,
        verification: { status: 'NOT_CONFIGURED', reasonCode: 'NOT_CONFIGURED', checkedAt: null },
        updatedAt: null,
      };
    }
    const fingerprintVerified = record.verificationStatus === 'VERIFIED'
      && record.verifiedFingerprint === settingsFingerprint(record);
    const expired = fingerprintVerified && !this.verificationIsFresh(record);
    return {
      provider: record.provider,
      apiUrlMasked: maskApiUrl(record.apiUrl),
      apiKeyConfigured: record.apiKey !== null,
      model: record.model,
      enabled: this.isEnabledAndVerified(record),
      revision: record.revision,
      verification: {
        status: record.provider === 'pi-agent' || expired ? 'UNVERIFIED' : record.verificationStatus,
        reasonCode: record.provider === 'pi-agent' ? 'PROVIDER_MIGRATION_REQUIRED' : expired ? 'VERIFICATION_EXPIRED' : record.verificationReasonCode,
        checkedAt: record.lastVerifiedAt,
      },
      updatedAt: record.updatedAt,
    };
  }

  private async serialized<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.mutationTail;
    let release!: () => void;
    this.mutationTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}
