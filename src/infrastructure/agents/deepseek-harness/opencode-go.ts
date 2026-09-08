import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Materialize public connection settings; the API key stays in the process environment. */
export function writeOpenCodeGoPatch(input: {
  runtimeDir: string;
  profile?: string;
  baseURL?: string;
  model: string;
  contextWindow?: number;
  maxTokens: number;
}): string {
  let endpoint: URL;
  try {
    endpoint = new URL(input.baseURL?.trim() || 'https://opencode.ai/zen/go/v1');
  } catch {
    throw new Error('CONFIG_INVALID: OPENCODE_GO_BASE_URL must be an HTTPS API base URL');
  }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error('CONFIG_INVALID: OPENCODE_GO_BASE_URL must be HTTPS without credentials, query or fragment');
  }
  const contextWindow = input.contextWindow ?? 262_144;
  if (!input.model.trim() || !Number.isSafeInteger(input.maxTokens) || input.maxTokens < 1
    || !Number.isSafeInteger(contextWindow) || contextWindow < input.maxTokens) {
    throw new Error('CONFIG_INVALID: OpenCode Go requires a model and context window >= positive max tokens');
  }
  const config = { providers: { 'opencode-go': {
      displayName: 'OpenCode Go', apiKeyEnv: 'OPENCODE_GO_API_KEY', api: 'openai-completions',
      baseURL: endpoint.href.replace(/\/$/, ''),
      headers: { 'User-Agent': 'domain-knowledge/0.1 (+https://github.com/linlisWorkTeam/domain-knowledge)' },
      compat: { thinkingFormat: 'deepseek' },
      models: [{ id: input.model, name: input.model, contextWindow, maxTokens: input.maxTokens }],
      retryPolicy: { mode: 'normal', maxRetries: 3 },
  } } };
  // sdk-minimal has no pi-ai/default-model entries to override. Explicitly mount
  // only the model adapter; the SDK initialize request selects provider/model.
  const entries = (input.profile ?? 'sdk-minimal') === 'sdk-minimal'
    ? [{ insert: [{ id: 'llm-pi-ai', name: '@deepseek-ai/dsh-llm-pi-ai', config }] }]
    : [
        { id: 'llm-pi-ai', config },
        { id: 'agent-default-model', config: { provider: 'opencode-go', model: input.model } },
      ];
  const patch = JSON.stringify(entries, null, 2);
  const directory = join(input.runtimeDir, 'dsh', 'provider-patches');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const digest = createHash('sha256').update(patch).digest('hex');
  const path = join(directory, `opencode-go-${digest}.json`);
  writeFileSync(path, patch, { mode: 0o600 });
  return path;
}
