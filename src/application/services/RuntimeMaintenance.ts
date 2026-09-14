/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：在删除及恢复期间隔离HTTP操作与后台调度，不抢占正在执行的工作。
 */
export interface RuntimeOperation {
  release(): void;
  exclusive<T>(work: () => Promise<T>): Promise<T>;
}
export class RuntimeMaintenance {
  private readonly operations = new Set<object>();
  private exclusiveActive = false;
  private readonly needsRecovery: () => boolean;
  private readonly idle: () => boolean;
  constructor(input: { needsRecovery: () => boolean; idle: () => boolean }) {
    this.needsRecovery = input.needsRecovery; this.idle = input.idle;
  }
  get status(): 'AVAILABLE' | 'MAINTENANCE' | 'RECOVERY_REQUIRED' {
    if (this.exclusiveActive) return 'MAINTENANCE';
    return this.needsRecovery() ? 'RECOVERY_REQUIRED' : 'AVAILABLE';
  }
  get available(): boolean { return this.status === 'AVAILABLE'; }
  enter(): RuntimeOperation {
    const status = this.status;
    if (status !== 'AVAILABLE') throw new Error(status === 'RECOVERY_REQUIRED' ? 'DELETION_RECOVERY_REQUIRED' : 'RUNTIME_MAINTENANCE');
    const key = {}; this.operations.add(key); let released = false;
    return { release: () => { if (!released) { released = true; this.operations.delete(key); } },
      exclusive: async work => {
        if (released || !this.operations.has(key)) throw new Error('RUNTIME_OPERATION_EXPIRED');
        if (this.operations.size !== 1 || !this.idle()) throw new Error('RUNTIME_OPERATIONS_ACTIVE');
        if (this.status !== 'AVAILABLE') throw new Error('DELETION_RECOVERY_REQUIRED');
        this.exclusiveActive = true;
        try { return await work(); } finally { this.exclusiveActive = false; }
      } };
  }
  /** 启动恢复入口专用；正常请求在持久意图未完成时不能进入。 */
  async recover<T>(work: () => Promise<T>): Promise<T> {
    if (this.exclusiveActive || this.operations.size || !this.idle()) throw new Error('RUNTIME_OPERATIONS_ACTIVE');
    this.exclusiveActive = true;
    try { return await work(); } finally { this.exclusiveActive = false; }
  }
}
