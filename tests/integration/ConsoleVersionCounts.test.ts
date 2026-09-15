/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证同模块多个批次的评测版本计数不会串批次或重复计数。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ConsoleReadModel } from '../../src/interfaces/runner/ConsoleReadModel.ts';

test('console: evaluated versions are distinct within each run, including same-module runs', () => {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec(`CREATE TABLE runs(run_id TEXT, module_id TEXT, policy_id TEXT, state TEXT, iteration INTEGER,
      best_version_id TEXT, created_at TEXT, updated_at TEXT);
      CREATE TABLE evaluations(run_id TEXT, version_id TEXT);
      CREATE TABLE gate_decisions(run_id TEXT, decision_json TEXT);
      INSERT INTO runs VALUES ('a','same','p','GENERATING',0,NULL,'now','now'),
        ('b','same','p','GENERATING',0,NULL,'now','now'),('c','same','p','CREATED',0,NULL,'now','now');
      INSERT INTO evaluations VALUES ('a','v1'),('a','v1'),('a','v2'),('b','v3');`);
    const rows = new ConsoleReadModel(database).listRunSummaries();
    assert.deepEqual(Object.fromEntries(rows.map(row => [row.runId, row.evaluatedVersionCount])), {a:2,b:1,c:0});
  } finally { database.close(); }
});
