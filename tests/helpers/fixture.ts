import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createComposition } from '../../src/interfaces/runner/composition.ts';

export const GOOD_BODY = `
## 概述

这是一条用于验证知识飞轮的完整知识。它解释为什么要把质量检查和行为发布门禁分开，避免文档分数被误当成软件正确性。

## 设计要点

- 候选知识先进入质量门禁，因为格式和溯源问题应尽早反馈。
- 受信评测器必须执行真实测试，因为只有运行证据才能支持 VERIFIED 发布。
- 发布使用幂等键，因为恢复和重试不能生成重复的发布记录。

## 为什么

生成式模型可能写出结构良好但语义错误的文档。因此确定性质量分只用于筛选候选，不能替代编译、测试、稳定性和关键用例结果。

## 适用场景

适用于从参考实现提炼知识并重新生成代码的单机工作流，也适用于需要审计、回滚和可追溯工件的知识运营流程。

## 验证

运行 \`npm test\`，确认候选状态仍是 CANDIDATE；随后由受信评测器提交 EvaluationReport，并确认只有 PASS GateDecision 能创建 publication。

补充说明：内容寻址存储使用 SHA-256 绑定 ID 与正文，SQLite 事务同时提交事件、状态和发布指针。恢复时相同 GenerationKey 必须返回已经提交的输出，而不能再次产生副作用。
`.trim();

export function createTestComposition(clock?: () => string) {
  const runtimeDir = mkdtempSync(join(tmpdir(), 'wp-flywheel-'));
  let tick = 0;
  const composition = createComposition({
    runtimeDir,
    clock: clock ?? (() => `2026-08-31T00:00:${String(tick++).padStart(2, '0')}.000Z`),
  });
  return {
    ...composition,
    dispose() {
      composition.close();
      rmSync(runtimeDir, { recursive: true, force: true });
    },
  };
}

export async function acceptedCandidate(composition: ReturnType<typeof createTestComposition>, suffix = '') {
  return composition.service.ingestCandidate({
    moduleId: `knowledge-gate${suffix}`,
    body: `${GOOD_BODY}\n${suffix}`,
    title: 'Knowledge Gate',
    description: 'Separate document quality from behavioral verification.',
    category: 'architecture',
    tags: ['flywheel', 'verification'],
    provenance: [{ path: 'specs/08-evaluation/knowledge-publication-gate.md', commit: 'abc123', pinned: true }],
  });
}
