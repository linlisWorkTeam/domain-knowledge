import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { migrateLegacyOkf, parseLegacyCard } from '../../src/infrastructure/migration/legacy-okf/index.ts';
import { createTestComposition, GOOD_BODY } from '../helpers/fixture.ts';

test('legacy verified cards migrate as candidates requiring behavioral verification', async () => {
  const fixture = createTestComposition();
  try {
    const directory = join(fixture.runtimeDir, 'legacy', 'concepts');
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'legacy-card.md'), `---\nname: legacy-card\ntitle: Legacy Card\ndescription: Migrated knowledge\nstatus: verified\nverified: true\nversion: 3\nsources:\n  - path: specs/README.md\n    commit: abc123\n    pinned: true\n---\n\n${GOOD_BODY}\n`);
    const result = await migrateLegacyOkf({ legacyKnowledgeRoot: join(fixture.runtimeDir, 'legacy'), service: fixture.service });
    assert.equal(result.imported, 1);
    assert.equal(result.errors.length, 0);
    const [version] = fixture.service.listKnowledgeVersions();
    assert.equal(version.status, 'CANDIDATE');
    assert.equal(version.metadata.legacyVerified, true);
    assert.equal(version.metadata.requiresBehavioralVerification, true);
  } finally {
    fixture.dispose();
  }
});

test('legacy migration records a repository-relative fallback source', async () => {
  const fixture = createTestComposition();
  try {
    const legacyRoot = join(fixture.runtimeDir, 'legacy');
    const directory = join(legacyRoot, 'drafts');
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'without-source.md'), `---\nname: without-source\n---\n\n${GOOD_BODY}\n`);
    const result = await migrateLegacyOkf({ legacyKnowledgeRoot: legacyRoot, service: fixture.service });
    assert.equal(result.imported, 1);
    const [version] = fixture.service.listKnowledgeVersions();
    assert.equal(version.provenance[0].path, 'legacy/drafts/without-source.md');
    assert.equal(version.metadata.migratedFrom, 'legacy/drafts/without-source.md');
  } finally {
    fixture.dispose();
  }
});

test('legacy parser keeps thematic breaks in Markdown body content', () => {
  const card = parseLegacyCard('---\nname: thematic-break\n---\n\n前文\n\n---\n\n后文\n');
  assert.equal(card.metadata.name, 'thematic-break');
  assert.equal(card.body, '前文\n\n---\n\n后文');
});

test('legacy parser rejects unterminated frontmatter instead of treating it as body', () => {
  assert.throws(
    () => parseLegacyCard('---\nname: broken\nbody without closing delimiter\n'),
    /LEGACY_CARD_INVALID: unterminated YAML frontmatter/,
  );
});
