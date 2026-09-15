/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：提供本地知识发布、读取、配置与手动 Git 同步用例。
 */
import type { LocalPublicationInput, LocalPublicationPort } from '../ports/PublicationPorts.ts';

/** 已发布知识的应用入口；由工作流传入领域发布凭据。 */
export class PublicationOperations {
  private readonly port: LocalPublicationPort;
  constructor(port: LocalPublicationPort) { this.port = port; }
  /** 发布前检查必须携带可追踪的确定性门禁证据。 */
  publish(input: LocalPublicationInput) {
    if (!input.publicationKey || !input.gateDecisionId || !input.runId || !input.versionId
      || !input.sourceCommit || !input.sourceDigest || !input.evidenceRefs.length || !input.body.trim()) {
      throw new Error('PUBLICATION_EVIDENCE_REQUIRED: publication receipt, source and gate evidence are required');
    }
    return this.port.publish(input);
  }
  /** 恢复已授权、尚未完成文件提交的发布。 */
  recover() { return this.port.recover(); }
  /** 读取不含令牌的发布设置。 */
  getSettings() { return this.port.getSettings(); }
  /** 保存服务器知识目录与默认关闭的同步设置。 */
  putSettings(input: Parameters<LocalPublicationPort['putSettings']>[0]) { return this.port.putSettings(input); }
  /** 列出发布状态；候选知识不会进入此目录。 */
  list() { return this.port.list(); }
  /** 读取正文与来源证据。 */
  get(key: string) { return this.port.get(key); }
  /** 浏览已授权的服务器目录。 */
  listDirectories(path?: string) { return this.port.listDirectories(path); }
  /** 用户明确点击后执行同步。 */
  sync() { return this.port.sync(); }
}
