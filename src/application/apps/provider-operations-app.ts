import { randomUUID } from 'node:crypto';
import { assertInvariant, sha256 } from '../../domain/index.ts';
import type {
  ProviderConnectionProbe,
  ProviderEndpointPolicy,
  ProviderSettingsRecord,
  ProviderSettingsStore,
  RunConfigurationSnapshot,
} from '../ports/index.ts';

export interface ProviderSettingsView {
  provider: 'pi-agent';
  apiUrlMasked: string | null;
  apiKeyConfigured: boolean;
  model: string | null;
  enabled: boolean;
  revision: number;
  verification: {
    status: ProviderSettingsRecord['verificationStatus'];
    reasonCode: string;
    checkedAt: string | null;
  };
  updatedAt: string | null;
}

interface ProviderAuditEvent {
  eventId: string;
  eventType: 'ComponentStatusChanged';
  occurredAt: string;
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

function runtimeDigest(record: ProviderSettingsRecord): string {
  // Credentials and the mutable settings revision are intentionally excluded. A
  // rotated, reverified key may resume a Run; endpoint/model changes may not.
  return sha256(JSON.stringify({
    provider: record.provider,
    apiUrl: record.apiUrl,
    model: record.model,
  }));
}

export class ProviderOperationsApp {
  readonly store: ProviderSettingsStore;
  readonly endpointPolicy: ProviderEndpointPolicy;
  readonly probe: ProviderConnectionProbe;
  readonly clock: () => string;
  readonly audit: (event: ProviderAuditEvent) => void;
  readonly verificationMaxAgeMs: number;
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(input: {
    store: ProviderSettingsStore;
    endpointPolicy: ProviderEndpointPolicy;
    probe: ProviderConnectionProbe;
    clock?: () => string;
    audit?: (event: ProviderAuditEvent) => void;
    verificationMaxAgeMs?: number;
  }) {
    this.store = input.store;
    this.endpointPolicy = input.endpointPolicy;
    this.probe = input.probe;
    this.clock = input.clock ?? (() => new Date().toISOString());
    this.audit = input.audit ?? (() => undefined);
    this.verificationMaxAgeMs = input.verificationMaxAgeMs ?? 24 * 60 * 60_000;
  }

  getSettings(): ProviderSettingsView {
    return this.view(this.store.load());
  }

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
    assertInvariant(input.provider === 'pi-agent', 'PROVIDER_UNSUPPORTED: provider must be pi-agent');
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
      : input.apiKey === undefined ? current?.apiKey ?? null : String(input.apiKey);
    const now = this.clock();
    const next: ProviderSettingsRecord = {
      provider: 'pi-agent',
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
      resourceId: 'pi-agent',
      eventId,
      revision: next.revision,
      acceptedAt: now,
      settings: this.view(next),
    };
  }

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
      resourceId: 'pi-agent',
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

  runConfigurationProvider(fallback: RunConfigurationSnapshot['provider']): RunConfigurationSnapshot['provider'] {
    const current = this.store.load();
    if (!current || !this.isEnabledAndVerified(current)) return structuredClone(fallback);
    return {
      kind: 'pi-agent',
      model: current.model as string,
      parametersSha256: runtimeDigest(current),
    };
  }

  requireRuntimeConfiguration(expected: RunConfigurationSnapshot['provider']): ProviderSettingsRecord {
    const current = this.store.load();
    assertInvariant(current !== null && this.isEnabledAndVerified(current),
      'PI_AGENT_CONFIGURATION_UNAVAILABLE: verified Provider settings are required');
    assertInvariant(expected.kind === 'pi-agent'
      && expected.model === current.model
      && expected.parametersSha256 === runtimeDigest(current),
    'PI_AGENT_CONFIGURATION_CHANGED: Provider settings no longer match the Run snapshot');
    return structuredClone(current);
  }

  private isEnabledAndVerified(record: ProviderSettingsRecord): boolean {
    return record.enabled
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
        provider: 'pi-agent',
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
        status: expired ? 'UNVERIFIED' : record.verificationStatus,
        reasonCode: expired ? 'VERIFICATION_EXPIRED' : record.verificationReasonCode,
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
