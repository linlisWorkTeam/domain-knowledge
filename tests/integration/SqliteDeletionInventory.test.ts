/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证真实表结构的跨库归属、共享引用保护与未知表拒绝忽略。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { sqliteDeletionInventory } from '../../src/infrastructure/sqlite/SqliteDeletionInventory.ts';
import { planBatchDeletion } from '../../src/domain/workbench/BatchDeletion.ts';

test('batch inventory follows pipelines and shared stage results across databases', () => {
  const workbench = new DatabaseSync(':memory:'), registry = new DatabaseSync(':memory:');
  try {
    workbench.exec(`CREATE TABLE wb_batches(batch_id TEXT PRIMARY KEY,value TEXT,lease_id TEXT);
      CREATE TABLE wb_pipelines(id TEXT PRIMARY KEY,record TEXT,lease_id TEXT);
      CREATE TABLE wb_stage_tasks(task_id TEXT PRIMARY KEY,snapshot TEXT,lease_id TEXT);
      CREATE TABLE wb_card_index(card_id TEXT PRIMARY KEY,snapshot TEXT)`);
    registry.exec('CREATE TABLE knowledge_versions(version_id TEXT PRIMARY KEY,metadata_json TEXT,body_ref_json TEXT,parent_version_id TEXT)');
    for (const name of ['a', 'b']) {
      workbench.prepare('INSERT INTO wb_batches VALUES(?,?,NULL)').run(name, JSON.stringify({ status: 'SUCCEEDED', rounds: [{ pipelineId: `pipeline-${name}` }], schedule: { enabled: false } }));
      workbench.prepare('INSERT INTO wb_pipelines VALUES(?,?,NULL)').run(`pipeline-${name}`, JSON.stringify({ status: 'SUCCEEDED', children: { GENERATE: { taskId: 'stage-shared' } } }));
    }
    workbench.prepare('INSERT INTO wb_stage_tasks VALUES(?,?,NULL)').run('stage-shared', JSON.stringify({ status: 'SUCCEEDED' }));
    registry.prepare('INSERT INTO knowledge_versions VALUES(?,?,?,NULL)').run('version', JSON.stringify({ stageTaskId: 'stage-shared' }), '{}');
    workbench.prepare('INSERT INTO wb_card_index VALUES(?,?)').run('card', JSON.stringify({ versionId: 'version' }));
    const inventory = sqliteDeletionInventory({ workbench, registry });
    const id = (table: string, key: string) => inventory.records.find(record => record.table === table && Object.values(record.key).includes(key))!.id;
    const stage = inventory.nodes.find(node => node.id === id('wb_stage_tasks', 'stage-shared'))!;
    assert.deepEqual(stage.ownedBy, [id('wb_pipelines', 'pipeline-a'), id('wb_pipelines', 'pipeline-b')].sort());
    const plan = planBatchDeletion(id('wb_batches', 'a'), inventory.nodes);
    assert.ok(plan.deleteIds.includes(id('wb_pipelines', 'pipeline-a')));
    for (const [table, key] of [['wb_stage_tasks', 'stage-shared'], ['knowledge_versions', 'version'], ['wb_card_index', 'card']]) {
      assert.ok(plan.preservedIds.includes(id(table!, key!)));
    }
    workbench.prepare('UPDATE wb_stage_tasks SET lease_id=?').run('active-lease');
    assert.throws(() => planBatchDeletion(id('wb_batches', 'a'), sqliteDeletionInventory({ workbench, registry }).nodes), /DELETION_EXECUTION_ACTIVE/);
  } finally { workbench.close(); registry.close(); }
});

test('legacy ownership uses candidate checkpoint output, never module name or evaluation consumption', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE runs(run_id TEXT PRIMARY KEY,module_id TEXT,state TEXT);
      CREATE TABLE checkpoints(generation_key TEXT PRIMARY KEY,run_id TEXT,node_id TEXT,output_refs_json TEXT);
      CREATE TABLE knowledge_versions(version_id TEXT PRIMARY KEY,module_id TEXT,body_ref_json TEXT,metadata_json TEXT);
      CREATE TABLE evaluations(report_id TEXT PRIMARY KEY,run_id TEXT,version_id TEXT);
      CREATE TABLE run_configuration_snapshots(run_id TEXT PRIMARY KEY,snapshot_json TEXT)`);
    db.exec("INSERT INTO runs VALUES('producer','same-module','VERIFIED'),('consumer','same-module','VERIFIED')");
    db.prepare('INSERT INTO checkpoints VALUES(?,?,?,?)').run('checkpoint', 'producer', 'candidate_knowledge', JSON.stringify([{ artifactId: 'sha256:body' }]));
    db.prepare('INSERT INTO knowledge_versions VALUES(?,?,?,?)').run('version', 'same-module', JSON.stringify({ artifactId: 'sha256:body' }), '{}');
    db.exec("INSERT INTO evaluations VALUES('report','consumer','version')");
    db.prepare('INSERT INTO run_configuration_snapshots VALUES(?,?)').run('producer', JSON.stringify({ token: 'PRIVATE_TEST_VALUE' }));
    const inventory = sqliteDeletionInventory({ registry: db });
    const id = (table: string, key: string) => inventory.records.find(record => record.table === table && Object.values(record.key).includes(key))!.id;
    assert.deepEqual(inventory.nodes.find(node => node.id === id('knowledge_versions', 'version'))!.ownedBy, [id('runs', 'producer')]);
    assert.ok(inventory.nodes.find(node => node.id === id('evaluations', 'report'))!.references.includes(id('knowledge_versions', 'version')));
    assert.doesNotMatch(JSON.stringify(inventory), /PRIVATE_TEST_VALUE/);
    // 配置父键由持久执行墓碑承接；消费者仍通过硬引用保留共享知识。
    const plan = planBatchDeletion(id('runs', 'producer'), inventory.nodes);
    assert.ok(plan.deleteIds.includes(id('runs', 'producer')));
    assert.ok(plan.preservedIds.includes(id('knowledge_versions', 'version')));
    assert.deepEqual(inventory.nodes.find(node => node.id === id('run_configuration_snapshots', 'producer'))!.auditReferences, [id('runs', 'producer')]);
  } finally { db.close(); }
});

test('unknown tables protect references and malformed records stop inventory creation', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE runs(run_id TEXT PRIMARY KEY,state TEXT);
      CREATE TABLE future_links(id TEXT PRIMARY KEY,target TEXT);
      CREATE TABLE wb_stage_tasks(task_id TEXT PRIMARY KEY,snapshot TEXT,lease_id TEXT);
      INSERT INTO runs VALUES('old-run','FAILED'); INSERT INTO future_links VALUES('link','old-run')`);
    const inventory = sqliteDeletionInventory({ registry: db });
    assert.deepEqual(inventory.unclassifiedTables, ['registry.future_links']);
    assert.throws(() => planBatchDeletion(inventory.nodes.find(node => node.kind === 'run')!.id, inventory.nodes), /DELETION_TARGET_REFERENCED/);
    db.exec("INSERT INTO wb_stage_tasks VALUES('bad','{broken',NULL)");
    assert.throws(() => sqliteDeletionInventory({ registry: db }), /DELETION_RECORD_JSON_INVALID/);
  } finally { db.close(); }
});

test('publication ownership follows its issuing run and gate, not a shared knowledge version', () => {
  const registry = new DatabaseSync(':memory:'), publications = new DatabaseSync(':memory:');
  try {
    registry.exec(`CREATE TABLE runs(run_id TEXT PRIMARY KEY,state TEXT);
      CREATE TABLE knowledge_versions(version_id TEXT PRIMARY KEY,metadata_json TEXT,body_ref_json TEXT);
      CREATE TABLE gate_decisions(decision_id TEXT PRIMARY KEY,run_id TEXT,version_id TEXT);
      CREATE TABLE publications(publication_key TEXT PRIMARY KEY,version_id TEXT,decision_id TEXT);
      INSERT INTO runs VALUES('origin','VERIFIED'),('consumer','VERIFIED');
      INSERT INTO knowledge_versions VALUES('shared','{}','{}');
      INSERT INTO gate_decisions VALUES('gate','origin','shared');
      INSERT INTO publications VALUES('publication','shared','gate')`);
    publications.exec('CREATE TABLE local_publications_v1(publication_key TEXT PRIMARY KEY,input_json TEXT,receipt_json TEXT)');
    publications.prepare('INSERT INTO local_publications_v1 VALUES(?,?,?)').run('publication', JSON.stringify({ runId: 'origin', versionId: 'shared' }), JSON.stringify({ runId: 'origin' }));
    const inventory = sqliteDeletionInventory({ registry, publications });
    const target = inventory.records.find(record => record.table === 'runs' && record.key.run_id === 'origin')!.id;
    const plan = planBatchDeletion(target, inventory.nodes);
    assert.equal(plan.counts.publication, 2);
    assert.ok(!plan.deleteIds.includes(inventory.records.find(record => record.table === 'knowledge_versions')!.id));
    publications.prepare('UPDATE local_publications_v1 SET receipt_json=?').run(JSON.stringify({ runId: 'consumer' }));
    assert.throws(() => planBatchDeletion(target, sqliteDeletionInventory({ registry, publications }).nodes), /DELETION_TARGET_REFERENCED/);
  } finally { registry.close(); publications.close(); }
});

test('catalog commit events follow their verified version identity instead of permanently pinning private knowledge', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE runs(run_id TEXT PRIMARY KEY,state TEXT);
      CREATE TABLE knowledge_versions(version_id TEXT PRIMARY KEY,module_id TEXT,metadata_json TEXT,body_ref_json TEXT);
      CREATE TABLE checkpoints(generation_key TEXT PRIMARY KEY,run_id TEXT,node_id TEXT,output_refs_json TEXT);
      CREATE TABLE events(event_id TEXT PRIMARY KEY,run_id TEXT,event_type TEXT,event_json TEXT);
      INSERT INTO runs VALUES('producer','FAILED')`);
    const body = { artifactId: 'sha256:body' };
    db.prepare('INSERT INTO knowledge_versions VALUES(?,?,?,?)').run('private', 'module', '{}', JSON.stringify(body));
    db.prepare('INSERT INTO checkpoints VALUES(?,?,?,?)').run('commit', 'producer', 'candidate_knowledge', JSON.stringify([body]));
    const event = { runId: 'catalog:module', payload: { versionId: 'private', artifactId: body.artifactId } };
    db.prepare('INSERT INTO events VALUES(?,?,?,?)').run('catalog-event', event.runId, 'ArtifactCommitted', JSON.stringify(event));
    const inventory = sqliteDeletionInventory({ registry: db }), target = inventory.nodes.find(node => node.kind === 'run')!.id;
    const plan = planBatchDeletion(target, inventory.nodes);
    assert.equal(plan.counts.knowledge, 1);
    assert.ok(plan.deleteIds.includes(inventory.records.find(record => record.table === 'events')!.id));
    db.prepare('UPDATE events SET event_json=?').run(JSON.stringify({ ...event, payload: { ...event.payload, artifactId: 'different' } }));
    const uncertain = planBatchDeletion(target, sqliteDeletionInventory({ registry: db }).nodes);
    assert.equal(uncertain.counts.knowledge, undefined, 'unproven catalog ownership must retain the version');
  } finally { db.close(); }
});
