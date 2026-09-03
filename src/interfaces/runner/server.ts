#!/usr/bin/env node
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { createComposition, loadOhMyWorkPanelScenario } from './composition.ts';
import type {
  OperationalMetricsPort, ProviderConnectionProbe, ProviderEndpointPolicy, ProviderSettingsStore,
} from '../../application/ports/index.ts';

export interface ServerBinding {
  host: string;
  port: number;
}

export function resolveServerBinding(
  configured: ServerBinding,
  environment: Partial<Pick<NodeJS.ProcessEnv, 'WP_KNOWLEDGE_HOST' | 'WP_KNOWLEDGE_PORT'>> = process.env,
): ServerBinding {
  const host = environment.WP_KNOWLEDGE_HOST?.trim() || configured.host;
  const rawPort = environment.WP_KNOWLEDGE_PORT?.trim();
  const port = rawPort ? Number(rawPort) : configured.port;
  if (!host) throw new Error('CONFIG_INVALID: server host must not be empty');
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error('CONFIG_INVALID: WP_KNOWLEDGE_PORT must be 1..65535');
  }
  return { host, port };
}

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../web');
const assets = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/app.js', 'app.js'],
  ['/styles.css', 'styles.css'],
]);

function send(response: ServerResponse, status: number, body: unknown, contentType = 'application/json; charset=utf-8'): void {
  const bytes = Buffer.isBuffer(body)
    ? body
    : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8');
  response.writeHead(status, {
    'content-type': contentType,
    'content-length': bytes.byteLength,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'",
  });
  response.end(bytes);
}

interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
    retryable: boolean;
    details: Record<string, unknown>;
  };
}

function requestId(request: IncomingMessage): string {
  const supplied = request.headers['x-request-id'];
  return typeof supplied === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(supplied)
    ? supplied
    : `req_${randomUUID()}`;
}

function errorBody(code: string, message: string, id: string, retryable = false): ApiErrorBody {
  return { error: { code, message, requestId: id, retryable, details: {} } };
}

function parseLimit(url: URL): number {
  const raw = url.searchParams.get('limit');
  const limit = raw === null ? 50 : Number(raw);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new Error('ARGUMENT_INVALID: limit must be 1..200');
  return limit;
}

function parseCursor(url: URL): number {
  const raw = url.searchParams.get('cursor');
  if (raw === null || raw === '') return 0;
  const decoded = Number(Buffer.from(raw, 'base64url').toString('utf8'));
  if (!Number.isSafeInteger(decoded) || decoded < 0) throw new Error('ARGUMENT_INVALID: cursor is invalid');
  return decoded;
}

function page<T>(values: T[], url: URL): { items: T[]; nextCursor: string | null; sampledAt: string } {
  const offset = parseCursor(url);
  const limit = parseLimit(url);
  const items = values.slice(offset, offset + limit);
  const nextOffset = offset + items.length;
  return {
    items,
    nextCursor: nextOffset < values.length ? Buffer.from(String(nextOffset)).toString('base64url') : null,
    sampledAt: new Date().toISOString(),
  };
}

function decodeOpaqueCursor(raw: string): string {
  try {
    const value = Buffer.from(raw, 'base64url').toString('utf8');
    if (!value) throw new Error();
    return value;
  } catch {
    throw new Error('ARGUMENT_INVALID: cursor is invalid');
  }
}

function keysetPage<T>(values: T[], url: URL, keyOf: (value: T) => string): {
  items: T[]; nextCursor: string | null; sampledAt: string;
} {
  const rawCursor = url.searchParams.get('cursor');
  const cursor = rawCursor ? decodeOpaqueCursor(rawCursor) : null;
  const eligible = cursor === null ? values : values.filter((value) => keyOf(value) < cursor);
  const limit = parseLimit(url);
  const items = eligible.slice(0, limit);
  return {
    items,
    nextCursor: eligible.length > items.length && items.length
      ? Buffer.from(keyOf(items.at(-1) as T)).toString('base64url')
      : null,
    sampledAt: new Date().toISOString(),
  };
}

function authorized(request: IncomingMessage, token: string | undefined): boolean {
  if (!token) return false;
  const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
  const left = Buffer.from(supplied);
  const right = Buffer.from(token);
  return left.byteLength === right.byteLength && timingSafeEqual(left, right);
}

function sseCursor(request: IncomingMessage, url: URL): number {
  const header = request.headers['last-event-id'];
  const headerValue = Array.isArray(header) ? header[0] : header;
  const queryValue = url.searchParams.get('after');
  if (headerValue && queryValue && headerValue !== queryValue) {
    throw new Error('INVALID_EVENT_CURSOR: Last-Event-ID and after differ');
  }
  const raw = headerValue || queryValue || '0';
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('INVALID_EVENT_CURSOR: cursor must be a non-negative integer');
  return value;
}

function decodeActivityCursor(raw: string): number {
  if (!raw) return 0;
  if (!raw.startsWith('act_')) throw new Error('INVALID_EVENT_CURSOR: activity cursor is invalid');
  const value = Number(Buffer.from(raw.slice(4), 'base64url').toString('utf8'));
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('INVALID_EVENT_CURSOR: activity cursor is invalid');
  return value;
}

function activitySseCursor(request: IncomingMessage, url: URL): number {
  const header = request.headers['last-event-id'];
  const headerValue = Array.isArray(header) ? header[0] : header;
  const queryValue = url.searchParams.get('after');
  if (headerValue && queryValue && headerValue !== queryValue) {
    throw new Error('INVALID_EVENT_CURSOR: Last-Event-ID and after differ');
  }
  return decodeActivityCursor(headerValue || queryValue || '');
}

function openSse(response: ServerResponse): void {
  response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
    'x-content-type-options': 'nosniff',
  });
  response.write(`event: ready\ndata: ${JSON.stringify({ connectedAt: new Date().toISOString() })}\n\n`);
}

function writeSse(response: ServerResponse, id: number | string, event: string, value: unknown): void {
  response.write(`id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(value)}\n\n`);
}

async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > 1_048_576) throw new Error('PAYLOAD_TOO_LARGE');
    chunks.push(bytes);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new Error('PAYLOAD_INVALID');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('PAYLOAD_INVALID');
  return parsed as Record<string, unknown>;
}

function payloadFingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function requireOnlyKeys(payload: Record<string, unknown>, allowed: readonly string[]): void {
  const unexpected = Object.keys(payload).filter((key) => !allowed.includes(key));
  if (unexpected.length) throw new Error(`PAYLOAD_INVALID: unexpected fields: ${unexpected.join(', ')}`);
}

export function mapHttpError(error: unknown, id = 'req_unknown'): { status: number; body: ApiErrorBody } {
  const message = error instanceof Error ? error.message : String(error);
  const code = message.split(':', 1)[0] || 'INTERNAL_ERROR';
  if (code === 'INVALID_EVENT_CURSOR') return { status: 400, body: errorBody(code, message, id) };
  if (code === 'PAYLOAD_TOO_LARGE') return { status: 413, body: errorBody(code, 'Request payload is too large.', id) };
  if (code === 'METHOD_NOT_ALLOWED') return { status: 405, body: errorBody(code, 'Method not allowed.', id) };
  if (code.endsWith('_NOT_FOUND')) return { status: 404, body: errorBody(code, 'Resource not found.', id) };
  if (code === 'SOURCE_ACCESS_DENIED') return { status: 403, body: errorBody(code, 'Source access is outside the configured boundary.', id) };
  if (code === 'SOURCE_ALREADY_EXISTS' || code === 'SOURCE_DELETED') {
    return { status: 409, body: errorBody(code, message, id) };
  }
  if (/(?:_ALREADY_RUNNING|_TERMINAL|_CONFLICT)$/.test(code)) {
    return { status: 409, body: errorBody(code, message, id) };
  }
  if (code === 'ACTION_ITEM_RESOLVED') return { status: 409, body: errorBody(code, message, id) };
  if (code === 'ACTION_NOT_ALLOWED' || code === 'RUN_NOT_RETRYABLE'
    || code === 'SOURCE_DISABLED' || code === 'SOURCE_CREDENTIAL_UNAVAILABLE') {
    return { status: 422, body: errorBody(code, message, id) };
  }
  if (code === 'PROVIDER_URL_UNREACHABLE') {
    return { status: 422, body: errorBody(code, message, id, true) };
  }
  if (/(?:_INVALID|_DENIED|_REQUIRED|_UNSUPPORTED)$/.test(code)) {
    return { status: 422, body: errorBody(code, message, id) };
  }
  return { status: 500, body: errorBody('INTERNAL_ERROR', 'Internal server error.', id) };
}

export function createKnowledgeServer(input: {
  repositoryRoot?: string;
  runtimeDir?: string;
  clock?: () => string;
  writeToken?: string;
  providerSettingsStore?: ProviderSettingsStore;
  providerEndpointPolicy?: ProviderEndpointPolicy;
  providerProbe?: ProviderConnectionProbe;
  operationalMetrics?: OperationalMetricsPort;
  componentChecks?: Partial<Record<'registry' | 'artifactStore' | 'workflow' | 'provider' | 'evaluator', () => Promise<void> | void>>;
  componentCheckTimeoutMs?: number;
} = {}) {
  const composition = createComposition(input);
  const writeToken = input.writeToken ?? process.env.WP_KNOWLEDGE_WRITE_TOKEN;
  const idempotencyResults = new Map<string, { fingerprint: string; status: number; value: unknown }>();
  const server = createHttpServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const currentRequestId = requestId(request);
    try {
      if (request.method === 'GET' && assets.has(url.pathname)) {
        const file = assets.get(url.pathname) as string;
        const bytes = readFileSync(join(webRoot, file));
        const contentType = extname(file) === '.html' ? 'text/html; charset=utf-8'
          : extname(file) === '.js' ? 'text/javascript; charset=utf-8'
          : 'text/css; charset=utf-8';
        send(response, 200, bytes, contentType);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/favicon.ico') {
        response.writeHead(204, { 'cache-control': 'public, max-age=86400' });
        response.end();
        return;
      }
      if (request.method === 'GET' && url.pathname === '/health') {
        send(response, 200, { ok: true });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/system/status') {
        send(response, 200, composition.apps.flywheel.status());
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/agents/providers/status') {
        send(response, 200, composition.apps.providerOperations.getStatus({
          provider: composition.agentProviderMode,
          model: composition.runConfiguration.provider.model,
        }));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/provider-settings') {
        send(response, 200, composition.apps.providerOperations.getSettings());
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/metrics/runs') {
        send(response, 200, composition.apps.operationalMetrics.runs(url.searchParams.get('window') ?? '24h'));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/metrics/governance') {
        send(response, 200, composition.apps.operationalMetrics.governance(url.searchParams.get('window') ?? '24h'));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/system/capabilities') {
        const providerStatus = composition.apps.providerOperations.getStatus({
          provider: composition.agentProviderMode,
          model: composition.runConfiguration.provider.model,
        });
        const activeProvider = providerStatus.enabled === true
          ? String(providerStatus.provider) : composition.agentProviderMode;
        const sdkIsolation = activeProvider === 'deepseek-harness'
          && (process.env.WP_DSH_PROCESS_ISOLATION?.trim() || 'bubblewrap') === 'bubblewrap';
        send(response, 200, {
          writeEnabled: Boolean(writeToken),
          automatedWorkflow: true,
          langGraphInfrastructure: true,
          agentProvider: activeProvider,
          agentPromptCustomization: 'promptAddon-only',
          agentPromptTransport: activeProvider === 'pi-agent'
            ? 'pi-agent-openai-compatible'
            : activeProvider === 'deepseek-harness'
            ? 'sdk-stdio-json-rpc'
            : activeProvider === 'deepseek-harness-headless'
              ? 'headless-stdin'
              : 'in-process-fixture',
          agentWorkspaceView: activeProvider === 'fixture'
            ? 'not-applicable'
            : 'role-allowlist',
          agentSourceIsolation: sdkIsolation ? 'bubblewrap' : 'not-proven',
          trustedProjectEvaluation: true,
          hostileCodeIsolation: false,
          authentication: writeToken ? 'bearer' : 'disabled',
        });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/system/components') {
        const sampledAt = new Date().toISOString();
        const providerStatus = composition.apps.providerOperations.getStatus({
          provider: composition.agentProviderMode,
          model: composition.runConfiguration.provider.model,
        });
        const componentNames = ['registry', 'artifactStore', 'workflow', 'provider', 'evaluator'] as const;
        const defaults: Record<typeof componentNames[number], () => Promise<void> | void> = {
          registry: () => { composition.apps.flywheel.status(); },
          artifactStore: () => {}, workflow: () => {}, provider: () => {}, evaluator: () => {},
        };
        const timeoutMs = input.componentCheckTimeoutMs ?? 250;
        const components = await Promise.all(componentNames.map(async (component) => {
          const check = input.componentChecks?.[component] ?? defaults[component];
          let timeout: NodeJS.Timeout | undefined;
          try {
            await Promise.race([
              Promise.resolve().then(check),
              new Promise<never>((_, reject) => {
                timeout = setTimeout(() => reject(new Error('COMPONENT_CHECK_TIMEOUT')), timeoutMs);
              }),
            ]);
            if (component === 'provider' && !input.componentChecks?.provider) {
              const status = String(providerStatus.availability);
              return {
                component,
                status,
                reasonCode: String(providerStatus.reasonCode),
                message: status === 'AVAILABLE' ? 'Provider 可用'
                  : status === 'UNAVAILABLE' ? 'Provider 当前不可用'
                    : status === 'UNKNOWN' ? 'Provider 状态未知' : 'Provider 尚未就绪',
                checkedAt: sampledAt,
                lastSucceededAt: status === 'AVAILABLE' ? sampledAt : null,
              };
            }
            const degraded = component === 'provider' && composition.agentProviderMode === 'fixture';
            return {
              component, status: degraded ? 'DEGRADED' : 'AVAILABLE',
              reasonCode: degraded ? 'FIXTURE_PROVIDER' : 'READY',
              message: degraded ? '当前使用确定性验收 Provider' : '组件可用',
              checkedAt: sampledAt, lastSucceededAt: sampledAt,
            };
          } catch (error) {
            const timedOut = error instanceof Error && error.message === 'COMPONENT_CHECK_TIMEOUT';
            return {
              component, status: timedOut ? 'UNKNOWN' : 'UNAVAILABLE',
              reasonCode: timedOut ? 'COMPONENT_CHECK_TIMEOUT' : 'COMPONENT_CHECK_FAILED',
              message: timedOut ? '组件检查超时' : '组件当前不可用',
              checkedAt: sampledAt, lastSucceededAt: null,
            };
          } finally {
            if (timeout) clearTimeout(timeout);
          }
        }));
        send(response, 200, {
          items: components,
          overall: components.some((component) => component.status === 'UNAVAILABLE')
            ? 'UNAVAILABLE'
            : components.some((component) => component.status === 'UNKNOWN') ? 'UNKNOWN'
              : components.some((component) => component.status === 'DEGRADED') ? 'DEGRADED' : 'AVAILABLE',
          sampledAt,
        });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/action-items') {
        const filters = Object.fromEntries(
          ['status', 'severity', 'type', 'runId']
            .map((key) => [key, url.searchParams.get(key)])
            .filter((entry): entry is [string, string] => entry[1] !== null && entry[1] !== ''),
        );
        const items = composition.apps.flywheel.listActionItems(filters).map((item) => (
          authorized(request, writeToken) ? item : { ...item, allowedActions: [] }
        ));
        send(response, 200, keysetPage(
          items,
          url,
          (item) => `${String(item.updatedAt)}\0${String(item.actionItemId)}`,
        ));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/activity/stream') {
        let cursor = activitySseCursor(request, url);
        openSse(response);
        const flush = () => {
          const pending = composition.apps.flywheel.listActivities()
            .map((item) => ({ item, position: decodeActivityCursor(String(item.cursor)) }))
            .filter((entry) => entry.position > cursor)
            .sort((left, right) => left.position - right.position);
          for (const entry of pending) {
            cursor = entry.position;
            writeSse(response, String(entry.item.cursor), 'activity', entry.item);
          }
        };
        flush();
        const polling = setInterval(flush, 250);
        const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 15_000);
        const lifetime = setTimeout(() => {
          response.write(`event: reconnect\ndata: ${JSON.stringify({ after: `act_${Buffer.from(String(cursor)).toString('base64url')}` })}\n\n`);
          response.end();
        }, 30 * 60_000);
        polling.unref();
        heartbeat.unref();
        lifetime.unref();
        response.once('close', () => {
          clearInterval(polling);
          clearInterval(heartbeat);
          clearTimeout(lifetime);
        });
        return;
      }
      if (request.method === 'GET' && url.pathname.startsWith('/api/v1/action-items/')) {
        const actionItemId = decodeURIComponent(url.pathname.slice('/api/v1/action-items/'.length));
        if (!actionItemId || actionItemId.includes('/')) {
          send(response, 404, errorBody('NOT_FOUND', 'Resource not found.', currentRequestId));
          return;
        }
        const item = composition.apps.flywheel.getActionItem(actionItemId);
        const visible = item && !authorized(request, writeToken) ? { ...item, allowedActions: [] } : item;
        send(response, visible ? 200 : 404, visible ?? errorBody('NOT_FOUND', 'Resource not found.', currentRequestId));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/activity') {
        const filters = Object.fromEntries(
          ['type', 'runId', 'severity', 'occurredAfter']
            .map((key) => [key, url.searchParams.get(key)])
            .filter((entry): entry is [string, string] => entry[1] !== null && entry[1] !== ''),
        );
        send(response, 200, keysetPage(
          composition.apps.flywheel.listActivities(filters),
          url,
          (item) => String(decodeActivityCursor(String(item.cursor))).padStart(20, '0'),
        ));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/runs') {
        const states = (url.searchParams.get('status') ?? '').split(',').filter(Boolean);
        const runs = composition.apps.flywheel.listRunSummaries(states.length ? states : undefined)
          .sort((left, right) => String(right.updatedAt ?? right.createdAt ?? '').localeCompare(String(left.updatedAt ?? left.createdAt ?? '')));
        send(response, 200, page(runs, url));
        return;
      }
      if (request.method === 'GET' && url.pathname.startsWith('/api/v1/runs/')) {
        const suffix = url.pathname.slice('/api/v1/runs/'.length);
        const segments = suffix.split('/');
        const [encodedRunId, child] = segments;
        if (segments.length > 2) {
          send(response, 404, errorBody('NOT_FOUND', 'Resource not found.', currentRequestId));
          return;
        }
        const runId = decodeURIComponent(encodedRunId ?? '');
        const snapshot = composition.apps.flywheel.getRunSnapshot(runId);
        if (!snapshot) {
          send(response, 404, errorBody('NOT_FOUND', 'Resource not found.', currentRequestId));
          return;
        }
        if (child === 'events') {
          const after = Number(url.searchParams.get('after') ?? 0);
          if (!Number.isSafeInteger(after) || after < 0) {
            send(response, 422, errorBody('ARGUMENT_INVALID', 'after must be a non-negative integer', currentRequestId));
            return;
          }
          const events = (snapshot.events as { eventSeq: number }[])
            .filter((record) => record.eventSeq > after);
          send(response, 200, { runId, events });
          return;
        }
        if (child === 'event-stream') {
          let cursor = sseCursor(request, url);
          openSse(response);
          const flush = () => {
            const current = composition.apps.flywheel.getRunSnapshot(runId);
            const pending = ((current?.events ?? []) as { eventSeq: number; event: unknown }[])
              .filter((record) => record.eventSeq > cursor);
            for (const record of pending) {
              cursor = record.eventSeq;
              writeSse(response, cursor, 'run-event', record.event);
            }
          };
          flush();
          const polling = setInterval(flush, 250);
          const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 15_000);
          const lifetime = setTimeout(() => {
            response.write(`event: reconnect\ndata: ${JSON.stringify({ after: cursor })}\n\n`);
            response.end();
          }, 30 * 60_000);
          polling.unref();
          heartbeat.unref();
          lifetime.unref();
          response.once('close', () => {
            clearInterval(polling);
            clearInterval(heartbeat);
            clearTimeout(lifetime);
          });
          return;
        }
        if (child === 'workflow-nodes') {
          send(response, 200, { runId, nodes: snapshot.workflowNodes ?? [] });
          return;
        }
        if (child === 'workflow-status') {
          send(response, 200, await composition.apps.orchestrator.status(runId));
          return;
        }
        if (child === 'progress') {
          send(response, 200, composition.apps.flywheel.getRunProgress(runId));
          return;
        }
        if (child === 'report') {
          response.setHeader('content-disposition', 'attachment; filename="wpknowledge-run-demo.json"');
          send(response, 200, await composition.apps.orchestrator.buildDemoReport(runId));
          return;
        }
        if (child) {
          send(response, 404, errorBody('NOT_FOUND', 'Resource not found.', currentRequestId));
          return;
        }
        send(response, 200, snapshot);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/knowledge/health') {
        send(response, 200, composition.apps.contentGovernance.getKnowledgeHealth(
          url.searchParams.get('window') ?? '30d',
        ));
        return;
      }
      const knowledgeRelation = url.pathname.match(
        /^\/api\/v1\/knowledge\/([^/]+)\/(lineage|diff)$/,
      );
      if (request.method === 'GET' && knowledgeRelation) {
        const versionId = decodeURIComponent(knowledgeRelation[1] ?? '');
        if (knowledgeRelation[2] === 'lineage') {
          const value = composition.apps.contentGovernance.getKnowledgeLineage(versionId);
          send(response, value ? 200 : 404,
            value ?? errorBody('KNOWLEDGE_VERSION_NOT_FOUND', 'Resource not found.', currentRequestId));
          return;
        }
        const against = url.searchParams.get('against');
        if (!against) throw new Error('ARGUMENT_REQUIRED: against');
        const value = await composition.apps.contentGovernance.getKnowledgeDiff(versionId, against);
        send(response, value ? 200 : 404,
          value ?? errorBody('KNOWLEDGE_VERSION_NOT_FOUND', 'Resource not found.', currentRequestId));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/knowledge') {
        const statuses = (url.searchParams.get('status') ?? '').split(',').filter(Boolean);
        const q = url.searchParams.get('q') ?? '';
        const category = url.searchParams.get('category') ?? undefined;
        const result = await composition.apps.knowledgeSearch.search({
          query: q,
          top: 200,
          statuses: statuses.length ? statuses : ['CANDIDATE', 'VERIFIED', 'LOW_CONFIDENCE', 'SUPERSEDED'],
          category,
        });
        send(response, 200, { ...page(result.hits, url), query: result.query, total: result.total });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/agents') {
        send(response, 200, { agents: composition.apps.orchestrator.listAgents() });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/evaluations') {
        const filters = Object.fromEntries(
          ['runId', 'moduleId', 'gate', 'status', 'from', 'to']
            .map((key) => [key, url.searchParams.get(key)])
            .filter((entry): entry is [string, string] => entry[1] !== null && entry[1] !== ''),
        );
        send(response, 200, keysetPage(
          composition.apps.contentGovernance.listEvaluations(filters),
          url,
          (item) => `${String(item.createdAt)}\0${String(item.evaluationId)}`,
        ));
        return;
      }
      const evaluationArtifact = url.pathname.match(
        /^\/api\/v1\/evaluations\/([^/]+)\/artifacts\/([^/]+)$/,
      );
      if (request.method === 'GET' && evaluationArtifact) {
        if (!writeToken) {
          send(response, 503, errorBody('WRITE_API_DISABLED', 'Set WP_KNOWLEDGE_WRITE_TOKEN to authorize evidence downloads.', currentRequestId, true));
          return;
        }
        if (!authorized(request, writeToken)) {
          send(response, 401, errorBody('UNAUTHORIZED', 'A valid Bearer token is required.', currentRequestId));
          return;
        }
        const evaluationId = decodeURIComponent(evaluationArtifact[1] ?? '');
        const artifactId = decodeURIComponent(evaluationArtifact[2] ?? '');
        const value = await composition.apps.contentGovernance.getEvaluationArtifact(evaluationId, artifactId);
        if (!value) {
          send(response, 404, errorBody('EVALUATION_ARTIFACT_NOT_FOUND', 'Resource not found.', currentRequestId));
          return;
        }
        response.setHeader('content-disposition', 'attachment; filename="evaluation-evidence"');
        send(response, 200, Buffer.from(value.bytes), value.ref.mediaType);
        return;
      }
      const evaluationArtifacts = url.pathname.match(/^\/api\/v1\/evaluations\/([^/]+)\/artifacts$/);
      if (request.method === 'GET' && evaluationArtifacts) {
        const evaluationId = decodeURIComponent(evaluationArtifacts[1] ?? '');
        const value = composition.apps.contentGovernance.listEvaluationArtifacts(
          evaluationId,
          authorized(request, writeToken),
        );
        send(response, value ? 200 : 404,
          value ?? errorBody('EVALUATION_NOT_FOUND', 'Resource not found.', currentRequestId));
        return;
      }
      const evaluationDetail = url.pathname.match(/^\/api\/v1\/evaluations\/([^/]+)$/);
      if (request.method === 'GET' && evaluationDetail) {
        const evaluationId = decodeURIComponent(evaluationDetail[1] ?? '');
        const value = composition.apps.contentGovernance.getEvaluation(evaluationId);
        send(response, value ? 200 : 404,
          value ?? errorBody('EVALUATION_NOT_FOUND', 'Resource not found.', currentRequestId));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/evaluation-rules') {
        send(response, 200, page(composition.apps.contentGovernance.listEvaluationRules(), url));
        return;
      }
      const evaluationRuleDetail = url.pathname.match(/^\/api\/v1\/evaluation-rules\/([^/]+)$/);
      if (request.method === 'GET' && evaluationRuleDetail) {
        const ruleId = decodeURIComponent(evaluationRuleDetail[1] ?? '');
        const value = composition.apps.contentGovernance.getEvaluationRule(ruleId);
        send(response, value ? 200 : 404,
          value ?? errorBody('EVALUATION_RULE_NOT_FOUND', 'Resource not found.', currentRequestId));
        return;
      }
      if (request.method === 'GET' && url.pathname.startsWith('/api/v1/knowledge/')) {
        const encodedVersionId = url.pathname.slice('/api/v1/knowledge/'.length);
        if (!encodedVersionId || encodedVersionId.includes('/')) {
          send(response, 404, errorBody('NOT_FOUND', 'Resource not found.', currentRequestId));
          return;
        }
        const versionId = decodeURIComponent(encodedVersionId);
        const value = await composition.apps.knowledgeSearch.get(versionId);
        send(response, value ? 200 : 404, value ?? errorBody('NOT_FOUND', 'Resource not found.', currentRequestId));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/sources/scan') {
        send(response, 200, composition.apps.knowledgeDiscovery.discover(
          composition.config.acquisition.roots,
          composition.config.acquisition.maxCandidates,
        ));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/sources') {
        const filters = Object.fromEntries(
          ['kind', 'type', 'status', 'project']
            .map((key) => [key, url.searchParams.get(key)])
            .filter((entry): entry is [string, string] => entry[1] !== null && entry[1] !== ''),
        );
        send(response, 200, keysetPage(
          composition.apps.contentGovernance.listSources(filters),
          url,
          (item) => `${String(item.updatedAt)}\0${String(item.sourceId)}`,
        ));
        return;
      }
      const sourceDetail = url.pathname.match(/^\/api\/v1\/sources\/([^/]+)$/);
      if (request.method === 'GET' && sourceDetail) {
        const sourceId = decodeURIComponent(sourceDetail[1] ?? '');
        const value = composition.apps.contentGovernance.getSource(sourceId);
        send(response, value ? 200 : 404,
          value ?? errorBody('SOURCE_NOT_FOUND', 'Resource not found.', currentRequestId));
        return;
      }
      const ruleUpdate = url.pathname.match(/^\/api\/v1\/evaluation-rules\/([^/]+)$/);
      const sourceUpdate = url.pathname.match(/^\/api\/v1\/sources\/([^/]+)$/);
      const sourceRefresh = url.pathname.match(/^\/api\/v1\/sources\/([^/]+)\/refresh$/);
      const isContentMutation = (request.method === 'PATCH' && (ruleUpdate !== null || sourceUpdate !== null))
        || (request.method === 'POST' && (url.pathname === '/api/v1/sources' || sourceRefresh !== null));
      if (isContentMutation) {
        if (!writeToken) {
          send(response, 503, errorBody('WRITE_API_DISABLED', 'Set WP_KNOWLEDGE_WRITE_TOKEN to enable mutations.', currentRequestId, true));
          return;
        }
        if (!authorized(request, writeToken)) {
          send(response, 401, errorBody('UNAUTHORIZED', 'A valid Bearer token is required.', currentRequestId));
          return;
        }
        const key = request.headers['idempotency-key'];
        if (typeof key !== 'string' || !key.trim()) throw new Error('IDEMPOTENCY_KEY_REQUIRED: Idempotency-Key');
        const payload = await body(request);
        const command = {
          idempotencyKey: key.trim(),
          fingerprint: JSON.stringify({ method: request.method, path: url.pathname, payload }),
          actor: 'local-admin',
        };
        if (request.method === 'PATCH' && ruleUpdate) {
          send(response, 200, composition.apps.contentGovernance.updateEvaluationRule(
            decodeURIComponent(ruleUpdate[1] ?? ''), payload, command,
          ));
          return;
        }
        if (request.method === 'POST' && url.pathname === '/api/v1/sources') {
          send(response, 201, await composition.apps.contentGovernance.createSource(payload, command));
          return;
        }
        if (request.method === 'POST' && sourceRefresh) {
          send(response, 202, await composition.apps.contentGovernance.refreshSource(
            decodeURIComponent(sourceRefresh[1] ?? ''), command,
          ));
          return;
        }
        if (request.method === 'PATCH' && sourceUpdate) {
          send(response, 200, await composition.apps.contentGovernance.updateSource(
            decodeURIComponent(sourceUpdate[1] ?? ''), payload, command,
          ));
          return;
        }
      }
      const isMutationRoute = url.pathname === '/api/v1/runs'
        || url.pathname === '/api/v1/knowledge/candidates'
        || url.pathname === '/api/v1/provider-settings'
        || url.pathname === '/api/v1/provider-settings/verify'
        || /^\/api\/v1\/runs\/[^/]+\/(?:resume|cancel)$/.test(url.pathname)
        || /^\/api\/v1\/knowledge\/[^/]+\/feedback$/.test(url.pathname)
        || /^\/api\/v1\/agents\/[^/]+\/prompt$/.test(url.pathname);
      const actionItemCommand = url.pathname.match(
        /^\/api\/v1\/action-items\/([^/]+)\/actions\/(acknowledge|resolve|retry)$/,
      );
      const regenerationCommand = url.pathname.match(
        /^\/api\/v1\/action-items\/([^/]+)\/regenerate$/,
      );
      const isControlMutation = actionItemCommand !== null || regenerationCommand !== null;
      if ((request.method === 'POST' || request.method === 'PUT') && (isMutationRoute || isControlMutation)) {
        if (!writeToken) {
          send(response, 503, errorBody('WRITE_API_DISABLED', 'Set WP_KNOWLEDGE_WRITE_TOKEN to enable mutations.', currentRequestId, true));
          return;
        }
        if (!authorized(request, writeToken)) {
          send(response, 401, errorBody('UNAUTHORIZED', 'A valid Bearer token is required.', currentRequestId));
          return;
        }
        const payload = await body(request);
        if (url.pathname === '/api/v1/provider-settings'
          || url.pathname === '/api/v1/provider-settings/verify') {
          if (url.pathname === '/api/v1/provider-settings' && request.method !== 'PUT') {
            throw new Error('METHOD_NOT_ALLOWED: Provider settings updates require PUT');
          }
          if (url.pathname === '/api/v1/provider-settings/verify' && request.method !== 'POST') {
            throw new Error('METHOD_NOT_ALLOWED: Provider verification requires POST');
          }
          requireOnlyKeys(payload, url.pathname.endsWith('/verify')
            ? ['expectedRevision', 'enable']
            : ['provider', 'apiUrl', 'apiKey', 'clearApiKey', 'model', 'expectedRevision']);
          const key = request.headers['idempotency-key'];
          if (typeof key !== 'string' || !key.trim()) {
            throw new Error('IDEMPOTENCY_KEY_REQUIRED: Idempotency-Key');
          }
          const scope = url.pathname.endsWith('/verify')
            ? 'provider-settings.verify' : 'provider-settings.put';
          const normalizedKey = key.trim();
          if (normalizedKey.length > 256 || /[\0\r\n]/.test(normalizedKey)) {
            throw new Error('IDEMPOTENCY_KEY_INVALID: Idempotency-Key must contain 1..256 safe characters');
          }
          // Store only a digest: PUT may contain the API key and command receipts are durable.
          const fingerprint = payloadFingerprint({ scope, payload });
          const memoryKey = `${scope}\0${normalizedKey}`;
          const previous = idempotencyResults.get(memoryKey)
            ?? composition.apps.flywheel.getCommandReceipt(scope, normalizedKey);
          if (previous && previous.fingerprint !== fingerprint) {
            throw new Error('IDEMPOTENCY_CONFLICT: key reused with different command');
          }
          if (previous) {
            send(response, previous.status, previous.value);
            return;
          }
          const value = scope === 'provider-settings.verify'
            ? await composition.apps.providerOperations.verify({
                expectedRevision: payload.expectedRevision,
                enable: payload.enable,
              })
            : await composition.apps.providerOperations.put({
                provider: payload.provider,
                apiUrl: payload.apiUrl,
                apiKey: payload.apiKey,
                clearApiKey: payload.clearApiKey,
                model: payload.model,
                expectedRevision: payload.expectedRevision,
              });
          composition.apps.flywheel.saveCommandReceipt({
            scope, idempotencyKey: normalizedKey, fingerprint, status: 200, value,
          });
          idempotencyResults.set(memoryKey, { fingerprint, status: 200, value });
          send(response, 200, value);
          return;
        }
        if (actionItemCommand || regenerationCommand) {
          if (request.method !== 'POST') throw new Error('METHOD_NOT_ALLOWED');
          const key = request.headers['idempotency-key'];
          if (typeof key !== 'string' || !key.trim()) throw new Error('IDEMPOTENCY_KEY_REQUIRED: Idempotency-Key');
          const normalizedKey = key.trim();
          const actionItemId = decodeURIComponent((actionItemCommand ?? regenerationCommand)?.[1] ?? '');
          const action = regenerationCommand
            ? 'REGENERATE'
            : String(actionItemCommand?.[2]).toUpperCase() as 'ACKNOWLEDGE' | 'RESOLVE' | 'RETRY';
          const fingerprint = JSON.stringify({ actionItemId, action, payload });
          const previous = idempotencyResults.get(normalizedKey)
            ?? composition.apps.flywheel.getCommandReceipt('action-item', normalizedKey);
          if (previous && previous.fingerprint !== fingerprint) throw new Error('IDEMPOTENCY_CONFLICT: key reused with different command');
          if (previous) {
            send(response, previous.status, previous.value);
            return;
          }
          const expectedRevision = Number(payload.expectedRevision);
          const reason = typeof payload.reason === 'string' ? payload.reason : '';
          const item = composition.apps.flywheel.getActionItem(actionItemId);
          if (!item) throw new Error(`ACTION_ITEM_NOT_FOUND: ${actionItemId}`);
          if (Number(item.revision) !== expectedRevision) throw new Error('REVISION_CONFLICT: action item changed');
          if (!Array.isArray(item.allowedActions) || !item.allowedActions.includes(action)) {
            throw new Error(`ACTION_NOT_ALLOWED: ${action}`);
          }
          let commandRunId: string | undefined;
          let status = 200;
          if (action === 'RETRY') {
            commandRunId = String(item.runId ?? '');
            if (!commandRunId) throw new Error('RUN_NOT_RETRYABLE: action item has no run');
            let workflowStatus;
            try {
              workflowStatus = await composition.apps.orchestrator.status(commandRunId);
            } catch {
              throw new Error(`RUN_NOT_RETRYABLE: ${commandRunId}`);
            }
            if (workflowStatus.executionStatus !== 'FAILED') {
              throw new Error(`RUN_NOT_RETRYABLE: ${commandRunId}`);
            }
            await composition.apps.orchestrator.resume(commandRunId);
            status = 202;
          } else if (action === 'REGENERATE') {
            const parentRunId = String(item.runId ?? '');
            const feedback = typeof payload.feedback === 'string' ? payload.feedback.trim() : '';
            if (!parentRunId) throw new Error('ACTION_NOT_ALLOWED: action item has no parent run');
            if (!feedback) throw new Error('ARGUMENT_REQUIRED: feedback');
            const parent = composition.apps.flywheel.getRunSnapshot(parentRunId);
            if (!parent) throw new Error(`RUN_NOT_FOUND: ${parentRunId}`);
            const scenario = loadOhMyWorkPanelScenario(composition.repositoryRoot);
            const parentModuleId = String((parent.run as Record<string, unknown>).moduleId ?? '');
            if (parentModuleId !== scenario.moduleId) {
              throw new Error('ACTION_NOT_ALLOWED: regeneration profile is unavailable for this module');
            }
            const handle = await composition.apps.orchestrator.start(scenario, {
              policyId: composition.config.publicationGate.policyId,
              minimumStability: composition.config.publicationGate.minimumStability,
              requireAllTests: composition.config.publicationGate.requireAllTests,
              maxIterations: composition.config.publicationGate.maxIterations,
              workerCount: 1,
              governanceTrigger: {
                parentRunId,
                causedByActionItemId: actionItemId,
                reason,
                feedback,
              },
            });
            commandRunId = handle.runId;
            status = 202;
          }
          const value = composition.apps.flywheel.applyActionItemAction({
            actionItemId, action, expectedRevision, reason,
            feedback: action === 'REGENERATE' ? String(payload.feedback ?? '') : undefined,
            commandRunId,
          });
          composition.apps.flywheel.saveCommandReceipt({
            scope: 'action-item', idempotencyKey: normalizedKey, fingerprint, status, value,
          });
          idempotencyResults.set(normalizedKey, { fingerprint, status, value });
          send(response, status, value);
          return;
        }
        if (url.pathname.startsWith('/api/v1/agents/') && url.pathname.endsWith('/prompt')) {
          if (request.method !== 'PUT') throw new Error('METHOD_NOT_ALLOWED: Agent prompt updates require PUT');
          const encodedAgentId = url.pathname.slice('/api/v1/agents/'.length, -'/prompt'.length);
          const agentId = decodeURIComponent(encodedAgentId);
          const keys = Object.keys(payload);
          if (keys.length !== 1 || keys[0] !== 'promptAddon') {
            throw new Error('AGENT_CUSTOMIZATION_DENIED: only promptAddon may be changed');
          }
          if (typeof payload.promptAddon !== 'string') {
            throw new Error('AGENT_CUSTOMIZATION_DENIED: promptAddon must be a string');
          }
          send(response, 200, composition.apps.orchestrator.updatePromptAddon(
            agentId as never,
            payload.promptAddon,
          ));
          return;
        }
        if (request.method !== 'POST') throw new Error('METHOD_NOT_ALLOWED');
        if (url.pathname === '/api/v1/runs') {
          const profile = String(payload.profile ?? 'ohmyworkpanel');
          if (profile !== 'ohmyworkpanel') throw new Error(`WORKFLOW_PROFILE_UNSUPPORTED: ${profile}`);
          const repositoryRoot = String(payload.repositoryRoot ?? '').trim();
          if (!repositoryRoot) throw new Error('ARGUMENT_REQUIRED: repositoryRoot');
          const key = request.headers['idempotency-key'];
          if (typeof key !== 'string' || !key.trim()) throw new Error('IDEMPOTENCY_KEY_REQUIRED: Idempotency-Key');
          const fingerprint = JSON.stringify(payload);
          const previous = idempotencyResults.get(key);
          if (previous && previous.fingerprint !== fingerprint) throw new Error('IDEMPOTENCY_CONFLICT: key reused with different payload');
          if (previous) {
            send(response, previous.status, previous.value);
            return;
          }
          const value = await composition.apps.orchestrator.start(
            loadOhMyWorkPanelScenario(repositoryRoot),
            {
              policyId: String(payload.policyId ?? composition.config.publicationGate.policyId),
              minimumStability: Number(
                payload.minimumStability ?? composition.config.publicationGate.minimumStability,
              ),
              requireAllTests: payload.requireAllTests === undefined
                ? composition.config.publicationGate.requireAllTests
                : payload.requireAllTests === true,
              maxIterations: Number(payload.maxIterations ?? composition.config.publicationGate.maxIterations),
              workerCount: Number(payload.workerCount ?? 1),
            },
          );
          idempotencyResults.set(key, { fingerprint, status: 202, value });
          send(response, 202, value);
          return;
        }
        const runCommand = url.pathname.match(/^\/api\/v1\/runs\/([^/]+)\/(resume|cancel)$/);
        if (runCommand) {
          const runId = decodeURIComponent(runCommand[1] ?? '');
          const key = request.headers['idempotency-key'];
          if (typeof key !== 'string' || !key.trim()) throw new Error('IDEMPOTENCY_KEY_REQUIRED: Idempotency-Key');
          const fingerprint = JSON.stringify({ runId, command: runCommand[2], payload });
          const previous = idempotencyResults.get(key);
          if (previous && previous.fingerprint !== fingerprint) throw new Error('IDEMPOTENCY_CONFLICT: key reused with different command');
          if (previous) {
            send(response, previous.status, previous.value);
            return;
          }
          if (runCommand[2] === 'resume') {
            const value = await composition.apps.orchestrator.resume(runId);
            idempotencyResults.set(key, { fingerprint, status: 202, value });
            send(response, 202, value);
            return;
          }
          await composition.apps.orchestrator.cancel(runId);
          const value = { runId, executionStatus: 'CANCELLED' };
          idempotencyResults.set(key, { fingerprint, status: 200, value });
          send(response, 200, value);
          return;
        }
        if (url.pathname === '/api/v1/knowledge/candidates') {
          send(response, 201, await composition.apps.flywheel.ingestCandidate({
            moduleId: String(payload.moduleId ?? ''),
            body: String(payload.body ?? ''),
            title: String(payload.title ?? ''),
            description: String(payload.description ?? ''),
            category: String(payload.category ?? ''),
            tags: Array.isArray(payload.tags) ? payload.tags.map(String) : [],
            provenance: Array.isArray(payload.provenance) ? payload.provenance as never[] : [],
            metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata as Record<string, unknown> : {},
          }));
          return;
        }
        const feedback = url.pathname.match(/^\/api\/v1\/knowledge\/([^/]+)\/feedback$/);
        if (feedback) {
          composition.apps.flywheel.recordFeedback(
            decodeURIComponent(feedback[1] ?? ''), String(payload.action ?? ''),
            payload.rating === null || payload.rating === undefined ? null : Number(payload.rating),
            String(payload.note ?? ''),
          );
          send(response, 200, { ok: true });
          return;
        }
      }
      send(response, 404, errorBody('NOT_FOUND', 'Resource not found.', currentRequestId));
    } catch (error) {
      const mapped = mapHttpError(error, currentRequestId);
      send(response, mapped.status, mapped.body);
    }
  });
  server.on('close', composition.close);
  return { server, composition };
}

export function startKnowledgeServer() {
  const instance = createKnowledgeServer();
  const binding = resolveServerBinding(instance.composition.config.server);
  instance.server.listen(binding.port, binding.host, () => {
    process.stdout.write(`domain-knowledge dashboard: http://${binding.host}:${binding.port}\n`);
  });
  return instance;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  startKnowledgeServer();
}
