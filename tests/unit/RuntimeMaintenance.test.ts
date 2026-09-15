/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证维护屏障等待请求和任务退出，并持续保护未完成的删除恢复。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { RuntimeMaintenance } from '../../src/application/services/RuntimeMaintenance.ts';
test('exclusive maintenance refuses other requests or background work and releases expired permits', async () => {
  let idle = true;
  const gate = new RuntimeMaintenance({ needsRecovery: () => false, idle: () => idle });
  const first = gate.enter(), second = gate.enter();
  await assert.rejects(first.exclusive(async () => assert.fail('must not run')), /RUNTIME_OPERATIONS_ACTIVE/);
  second.release(); idle = false;
  await assert.rejects(first.exclusive(async () => assert.fail('must not run')), /RUNTIME_OPERATIONS_ACTIVE/);
  idle = true; let finish!: () => void;
  const running = first.exclusive(async () => { await new Promise<void>(resolve => { finish = resolve; }); });
  assert.equal(gate.status, 'MAINTENANCE'); assert.throws(() => gate.enter(), /RUNTIME_MAINTENANCE/);
  finish(); await running; first.release(); first.release();
  await assert.rejects(first.exclusive(async () => {}), /RUNTIME_OPERATION_EXPIRED/);
  assert.equal(gate.status, 'AVAILABLE');
});
test('a failed deletion with a durable intent stays closed until explicit recovery completes', async () => {
  let pending = false;
  const gate = new RuntimeMaintenance({ needsRecovery: () => pending, idle: () => true });
  const request = gate.enter();
  await assert.rejects(request.exclusive(async () => { pending = true; throw new Error('partial commit'); }), /partial commit/);
  request.release(); assert.equal(gate.status, 'RECOVERY_REQUIRED');
  assert.throws(() => gate.enter(), /DELETION_RECOVERY_REQUIRED/);
  await gate.recover(async () => { assert.equal(gate.status, 'MAINTENANCE'); pending = false; });
  assert.equal(gate.status, 'AVAILABLE');
});
test('async execution checks hold the maintenance barrier and reject an expired request', async () => {
  let resolve!: (idle: boolean) => void;
  const gate = new RuntimeMaintenance({ needsRecovery: () => false, idle: () => true,
    verifyIdle: () => new Promise<boolean>(done => { resolve = done; }) });
  const request = gate.enter();
  const operation = request.exclusive(async () => assert.fail('expired request cannot delete'));
  assert.equal(gate.status, 'MAINTENANCE');
  assert.throws(() => gate.enter(), /RUNTIME_MAINTENANCE/);
  await assert.rejects(gate.recover(async () => {}), /RUNTIME_OPERATIONS_ACTIVE/);
  request.release(); resolve(true);
  await assert.rejects(operation, /RUNTIME_OPERATION_EXPIRED/);
  assert.equal(gate.available, true);
});
test('failed or unavailable execution probes block deletion and recovery without opening pending data', async () => {
  let pending = false, unavailable = false;
  const gate = new RuntimeMaintenance({ needsRecovery: () => pending, idle: () => true,
    verifyIdle: async () => { if (unavailable) throw new Error('status unavailable'); return false; } });
  const request = gate.enter();
  await assert.rejects(request.exclusive(async () => assert.fail('active')), /RUNTIME_OPERATIONS_ACTIVE/);
  unavailable = true;
  await assert.rejects(request.exclusive(async () => assert.fail('unknown')), /status unavailable/);
  request.release(); pending = true;
  await assert.rejects(gate.recover(async () => assert.fail('unknown')), /status unavailable/);
  assert.equal(gate.status, 'RECOVERY_REQUIRED');
});
