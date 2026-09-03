#!/usr/bin/env node
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { createComposition, loadOhMyWorkPanelScenario } from './composition.ts';
import { ConsoleReadModel } from './console-read-model.ts';
import { buildDemoReport } from './demo-report.ts';

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

function authorized(request: IncomingMessage, token: string | undefined): boolean {
  if (!token) return false;
  const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
  const left = Buffer.from(supplied);
  const right = Buffer.from(token);
  return left.byteLength === right.byteLength && timingSafeEqual(left, right);
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

export function mapHttpError(error: unknown): { status: number; body: { error: string; message?: string } } {
  const message = error instanceof Error ? error.message : String(error);
  const code = message.split(':', 1)[0] || 'INTERNAL_ERROR';
  if (code === 'PAYLOAD_TOO_LARGE') return { status: 413, body: { error: code } };
  if (code === 'METHOD_NOT_ALLOWED') return { status: 405, body: { error: code } };
  if (code.endsWith('_NOT_FOUND')) return { status: 404, body: { error: code } };
  if (/(?:_ALREADY_RUNNING|_TERMINAL|_CONFLICT)$/.test(code)) {
    return { status: 409, body: { error: code, message } };
  }
  if (/(?:_INVALID|_DENIED|_REQUIRED|_UNSUPPORTED)$/.test(code)) {
    return { status: 400, body: { error: code, message } };
  }
  return { status: 500, body: { error: 'INTERNAL_ERROR' } };
}

export function createKnowledgeServer(input: {
  repositoryRoot?: string;
  runtimeDir?: string;
  writeToken?: string;
} = {}) {
  const composition = createComposition(input);
  const consoleReadModel = new ConsoleReadModel(composition.repository.database);
  const writeToken = input.writeToken ?? process.env.WP_KNOWLEDGE_WRITE_TOKEN;
  const server = createHttpServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
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
      if (request.method === 'GET' && url.pathname === '/api/v1/status') {
        send(response, 200, composition.apps.flywheel.status());
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/capabilities') {
        const sdkIsolation = composition.agentProviderMode === 'deepseek-harness'
          && (process.env.WP_DSH_PROCESS_ISOLATION?.trim() || 'bubblewrap') === 'bubblewrap';
        send(response, 200, {
          writeEnabled: Boolean(writeToken),
          automatedWorkflow: true,
          langGraphInfrastructure: true,
          agentProvider: composition.agentProviderMode,
          agentPromptCustomization: 'promptAddon-only',
          agentPromptTransport: composition.agentProviderMode === 'deepseek-harness'
            ? 'sdk-stdio-json-rpc'
            : composition.agentProviderMode === 'deepseek-harness-headless'
              ? 'headless-stdin'
              : 'in-process-fixture',
          agentWorkspaceView: composition.agentProviderMode === 'fixture'
            ? 'not-applicable'
            : 'role-allowlist',
          agentSourceIsolation: sdkIsolation ? 'bubblewrap' : 'not-proven',
          trustedProjectEvaluation: true,
          hostileCodeIsolation: false,
          authentication: writeToken ? 'bearer' : 'disabled',
        });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/runs') {
        const states = (url.searchParams.get('state') ?? '').split(',').filter(Boolean);
        send(response, 200, { runs: consoleReadModel.listRunSummaries(states.length ? states : undefined) });
        return;
      }
      if (request.method === 'GET' && url.pathname.startsWith('/api/v1/runs/')) {
        const suffix = url.pathname.slice('/api/v1/runs/'.length);
        const segments = suffix.split('/');
        const [encodedRunId, child] = segments;
        if (segments.length > 2) {
          send(response, 404, { error: 'NOT_FOUND' });
          return;
        }
        const runId = decodeURIComponent(encodedRunId ?? '');
        const snapshot = consoleReadModel.getRunSnapshot(
          runId,
          composition.apps.flywheel.listKnowledgeVersions(),
        );
        if (!snapshot) {
          send(response, 404, { error: 'NOT_FOUND' });
          return;
        }
        if (child === 'events') {
          const after = Number(url.searchParams.get('after') ?? 0);
          if (!Number.isSafeInteger(after) || after < 0) {
            send(response, 400, { error: 'ARGUMENT_INVALID', message: 'after must be a non-negative integer' });
            return;
          }
          const events = (snapshot.events as { eventSeq: number }[])
            .filter((record) => record.eventSeq > after);
          send(response, 200, { runId, events });
          return;
        }
        if (child === 'workflow-nodes') {
          send(response, 200, { runId, nodes: snapshot.workflowNodes ?? [] });
          return;
        }
        if (child === 'workflow-status') {
          send(response, 200, await (await composition.apps.orchestrator()).status(runId));
          return;
        }
        if (child === 'demo-report') {
          response.setHeader('content-disposition', 'attachment; filename="wpknowledge-run-demo.json"');
          send(response, 200, await buildDemoReport({
            runId, runtimeDir: composition.runtimeDir, repository: composition.repository,
            service: composition.apps.flywheel, artifacts: composition.artifacts,
          }));
          return;
        }
        if (child) {
          send(response, 404, { error: 'NOT_FOUND' });
          return;
        }
        send(response, 200, snapshot);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/knowledge') {
        const statuses = (url.searchParams.get('status') ?? '').split(',').filter(Boolean);
        send(response, 200, { knowledge: composition.apps.flywheel.listKnowledgeVersions(statuses.length ? statuses : undefined) });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/agents') {
        send(response, 200, { agents: composition.agents.list() });
        return;
      }
      if (request.method === 'GET' && url.pathname.startsWith('/api/v1/knowledge/')) {
        const versionId = decodeURIComponent(url.pathname.slice('/api/v1/knowledge/'.length));
        const value = await composition.apps.knowledgeSearch.get(versionId);
        send(response, value ? 200 : 404, value ?? { error: 'NOT_FOUND' });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/query') {
        const requestedStatuses = url.searchParams.get('status');
        const statuses = requestedStatuses === null
          ? ['VERIFIED']
          : requestedStatuses
            ? requestedStatuses.split(',').filter(Boolean)
            : ['CANDIDATE', 'VERIFIED', 'LOW_CONFIDENCE', 'SUPERSEDED'];
        send(response, 200, await composition.apps.knowledgeSearch.search({
          query: url.searchParams.get('q') ?? '',
          top: Number(url.searchParams.get('top') ?? 8),
          statuses,
          category: url.searchParams.get('category') ?? undefined,
        }));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/scan') {
        send(response, 200, composition.apps.knowledgeDiscovery.discover(
          composition.config.acquisition.roots,
          composition.config.acquisition.maxCandidates,
        ));
        return;
      }
      if ((request.method === 'POST' || request.method === 'PUT') && url.pathname.startsWith('/api/v1/')) {
        if (!writeToken) {
          send(response, 503, { error: 'WRITE_API_DISABLED', message: 'Set WP_KNOWLEDGE_WRITE_TOKEN to enable mutations.' });
          return;
        }
        if (!authorized(request, writeToken)) {
          send(response, 401, { error: 'UNAUTHORIZED' });
          return;
        }
        const payload = await body(request);
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
          send(response, 200, composition.agents.updatePromptAddon(
            agentId as never,
            payload.promptAddon,
          ));
          return;
        }
        if (request.method !== 'POST') throw new Error('METHOD_NOT_ALLOWED');
        if (url.pathname === '/api/v1/run-commands/start') {
          const profile = String(payload.profile ?? 'ohmyworkpanel');
          if (profile !== 'ohmyworkpanel') throw new Error(`WORKFLOW_PROFILE_UNSUPPORTED: ${profile}`);
          const repositoryRoot = String(payload.repositoryRoot ?? '').trim();
          if (!repositoryRoot) throw new Error('ARGUMENT_REQUIRED: repositoryRoot');
          const workflow = await composition.apps.orchestrator();
          send(response, 202, await workflow.start(
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
          ));
          return;
        }
        if (url.pathname === '/api/v1/run-commands/resume') {
          send(response, 202, await (await composition.apps.orchestrator()).resume(String(payload.runId ?? '')));
          return;
        }
        if (url.pathname === '/api/v1/run-commands/cancel') {
          const runId = String(payload.runId ?? '');
          await (await composition.apps.orchestrator()).cancel(runId);
          send(response, 200, { runId, executionStatus: 'CANCELLED' });
          return;
        }
        if (url.pathname === '/api/v1/ingest') {
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
        if (url.pathname === '/api/v1/feedback') {
          composition.apps.flywheel.recordFeedback(
            String(payload.versionId ?? ''), String(payload.action ?? ''),
            payload.rating === null || payload.rating === undefined ? null : Number(payload.rating),
            String(payload.note ?? ''),
          );
          send(response, 200, { ok: true });
          return;
        }
        if (url.pathname === '/api/v1/runs') {
          send(response, 201, composition.apps.flywheel.createRun(String(payload.moduleId ?? ''), String(payload.policyId ?? composition.config.publicationGate.policyId)));
          return;
        }
        if (url.pathname === '/api/v1/transition') {
          send(response, 200, composition.apps.flywheel.transition(String(payload.runId ?? ''), String(payload.state ?? '') as never));
          return;
        }
        if (url.pathname === '/api/v1/evaluate') {
          send(response, 201, await composition.apps.evalRunner.evaluate({
            runId: String(payload.runId ?? ''),
            versionId: String(payload.versionId ?? ''),
            evidenceRefs: Array.isArray(payload.evidenceRefs) ? payload.evidenceRefs as never[] : [],
            toolchainFingerprint: String(payload.toolchainFingerprint ?? ''),
            criticalFailures: Number(payload.criticalFailures ?? 0),
            testsPassed: Number(payload.testsPassed ?? 0),
            testsTotal: Number(payload.testsTotal ?? 0),
            stability: Number(payload.stability ?? 0),
            infrastructureFailure: Boolean(payload.infrastructureFailure),
          }, composition.config.publicationGate));
          return;
        }
        if (url.pathname === '/api/v1/publish') {
          send(response, 201, await composition.apps.flywheel.publish(
            String(payload.runId ?? ''), String(payload.versionId ?? ''), String(payload.decisionId ?? ''),
          ));
          return;
        }
      }
      send(response, 404, { error: 'NOT_FOUND' });
    } catch (error) {
      const mapped = mapHttpError(error);
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
