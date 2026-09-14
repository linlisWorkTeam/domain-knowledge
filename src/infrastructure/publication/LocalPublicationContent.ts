/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：确定性渲染旧本地发布正文与来源元数据，供发布及删除核验共用。
 */
import type { LocalPublicationInput, LocalPublicationReceipt } from '../../application/ports/PublicationPorts.ts';
export function localPublicationContent(input: LocalPublicationInput, receipt: LocalPublicationReceipt) {
  const metadata = { schemaVersion: '1.0', ...input, body: undefined, bodySha256: receipt.bodySha256, createdAt: receipt.createdAt };
  return {
    markdown: `${input.body.trimEnd()}\n\n---\n\n来源提交：${input.sourceCommit}\n\n来源摘要：${input.sourceDigest}\n\n运行：${input.runId} · 版本：${input.versionId} · 门禁：${input.gateDecisionId}\n`,
    metadataText: `${JSON.stringify(metadata, null, 2)}\n`,
  };
}
