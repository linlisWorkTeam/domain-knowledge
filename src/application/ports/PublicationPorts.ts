/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义已通过门禁的本地发布与手动同步边界。
 */

/** 调用者必须先取得领域发布凭据；本端口不接受候选知识。 */
export interface LocalPublicationInput {
  publicationKey: string;
  gateDecisionId: string;
  runId: string;
  versionId: string;
  moduleId: string;
  title: string;
  body: string;
  sourceCommit: string;
  sourceDigest: string;
  evidenceRefs: unknown[];
}
/** 文件提交与审计记录共同构成可恢复发布收据。 */
export interface LocalPublicationReceipt {
  schemaVersion: '1.0';
  publicationKey: string;
  versionId: string;
  runId: string;
  moduleId: string;
  bodySha256: string;
  path: string;
  status: 'PENDING' | 'PUBLISHED';
  createdAt: string;
}
/** 敏感令牌不属于读取模型。 */
export interface PublicationSettings {
  directory: string;
  git: { enabled: boolean; remote: string; branch: string; tokenConfigured: boolean };
}
/** 本地发布的技术适配边界。 */
export interface LocalPublicationPort {
  publish(input: LocalPublicationInput): Promise<LocalPublicationReceipt>;
  recover(): Promise<LocalPublicationReceipt[]>;
  getSettings(): PublicationSettings;
  putSettings(input: { directory?: string; git?: { enabled: boolean; remote: string; branch: string; token?: string; clearToken?: boolean } }): PublicationSettings;
  list(): LocalPublicationReceipt[];
  get(publicationKey: string): { receipt: LocalPublicationReceipt; markdown: string; metadata: LocalPublicationInput };
  listDirectories(path?: string): { path: string; parent: string | null; directories: string[] };
  sync(): Promise<{ status: 'SYNCED'; commit: string; publishedCount: number }>;
  close(): void;
}
