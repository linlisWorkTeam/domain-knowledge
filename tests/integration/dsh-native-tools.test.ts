import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DeepSeekHarnessSdkAgent, type DeepSeekHarnessAuditRecord } from '../../src/infrastructure/agents/deepseek-harness/index.ts';

test('native DSH enforces role material reads and refuses sibling, symlink, secret and shell access', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-native-tools-'));
  const workspace = join(root, 'view');
  mkdirSync(workspace);
  writeFileSync(join(workspace, 'source.txt'), 'AUTHORIZED_MATERIAL');
  writeFileSync(join(workspace, '.secret'), 'HIDDEN_SECRET');
  writeFileSync(join(root, 'private.txt'), 'REFERENCE_SECRET');
  symlinkSync(join(root, 'private.txt'), join(workspace, 'escape.txt'));
  const calls = [
    { name: 'read_material', arguments: { path: 'source.txt' } },
    { name: 'read_material', arguments: { path: '../private.txt' } },
    { name: 'read_material', arguments: { path: 'escape.txt' } },
    { name: 'read_material', arguments: { path: '.secret' } },
    { name: 'bash', arguments: { command: 'cat ../private.txt' } },
  ];
  const bodies: any[] = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    bodies.push(JSON.parse(body));
    const call = calls[bodies.length - 1];
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const delta = call
      ? { tool_calls: [{ index: 0, id: `call-${bodies.length}`, type: 'function', function: {
          name: call.name, arguments: JSON.stringify(call.arguments),
        } }] }
      : { content: '{"answer":"done"}' };
    res.end(`data: ${JSON.stringify({ id: 'local', choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`
      + `data: ${JSON.stringify({ id: 'local', choices: [{ index: 0, delta: {}, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\n`
      + 'data: [DONE]\n\n');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const audits: DeepSeekHarnessAuditRecord[] = [];
  try {
    const agent = new DeepSeekHarnessSdkAgent({
      allowedWorkspaceRoots: [workspace], dshHome: join(root, 'home'), timeoutMs: 20_000,
      env: { DEEPSEEK_BASE_URL: `http://127.0.0.1:${address.port}/v1`, DEEPSEEK_API_KEY: 'local-test-key' },
      onAudit: (record) => { audits.push(record); },
    });
    assert.deepEqual(await agent.run({
      role: 'doc-gen', workspaceRoot: workspace, prompt: 'Read the authorized material.',
      outputSchema: { type: 'object', required: ['answer'], additionalProperties: false,
        properties: { answer: { type: 'string' } } },
      idempotencyKey: 'native-tools:doc-gen:0', metadata: { runId: 'native-tools' },
    }), { answer: 'done' });
    assert.equal(bodies.length, 6);
    for (const body of bodies) assert.deepEqual(body.tools.map((tool: any) => tool.function.name), ['read_material']);
    assert.equal(bodies[1].messages.at(-1).content, 'AUTHORIZED_MATERIAL');
    for (const body of bodies.slice(2, 5)) assert.match(body.messages.at(-1).content, /DSH_MATERIAL_DENIED/);
    assert.match(bodies[5].messages.at(-1).content, /unknown|not found|denied/i);
    assert.doesNotMatch(JSON.stringify(bodies), /REFERENCE_SECRET|HIDDEN_SECRET/);
    assert.equal(audits[0].status, 'SUCCEEDED');
    assert.equal(audits[0].metadata.runId, 'native-tools');
    assert.match(audits[0].sessionId!, /^wp-/);
    assert.ok(audits[0].notificationCount! > 0);
    assert.doesNotMatch(JSON.stringify(audits), /local-test-key|AUTHORIZED_MATERIAL/);
  } finally {
    await new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); });
    rmSync(root, { recursive: true, force: true });
  }
});
