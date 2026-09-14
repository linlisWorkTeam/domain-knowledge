/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：用 Linux 启动身份和进程启动时刻识别已退出的检查点执行者。
 */
import { readFileSync } from 'node:fs';

interface Owner { version: 1; pid: number; bootId: string; startTime: string }

function startTime(pid: number): string {
  const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
  // comm 字段可以含空格或括号，从最后一个右括号之后解析第 22 字段。
  const value = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
  if (!value || !/^\d+$/.test(value)) throw new Error('CHECKPOINT_OWNER_UNAVAILABLE');
  return value;
}

/** 无法建立身份时保持原租约规则，不猜测进程存活状态。 */
export function checkpointOwner(): Owner | null {
  if (process.platform !== 'linux') return null;
  try { return { version: 1, pid: process.pid,
    bootId: readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim(), startTime: startTime(process.pid) }; }
  catch { return null; }
}

/** 区分可验证的存活、退出及未知身份，不以读取失败推断已停止。 */
export function checkpointOwnerState(value: unknown): 'EXITED' | 'RUNNING' | 'UNKNOWN' {
  if (process.platform !== 'linux' || !value || typeof value !== 'object') return 'UNKNOWN';
  const owner = value as Owner;
  if (owner.version !== 1 || !Number.isSafeInteger(owner.pid) || owner.pid < 1
    || typeof owner.bootId !== 'string' || !/^[0-9a-f-]{36}$/.test(owner.bootId)
    || typeof owner.startTime !== 'string' || !/^\d+$/.test(owner.startTime)) return 'UNKNOWN';
  let bootId: string;
  try { bootId = readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim(); } catch { return 'UNKNOWN'; }
  if (bootId !== owner.bootId) return 'EXITED';
  try { return startTime(owner.pid) !== owner.startTime ? 'EXITED' : 'RUNNING'; }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'ENOENT' || (error as NodeJS.ErrnoException).code === 'ESRCH' ? 'EXITED' : 'UNKNOWN'; }
}

/** 不完整身份或进程读取失败仍不能证明执行者已退出。 */
export function checkpointOwnerExited(value: unknown): boolean { return checkpointOwnerState(value) === 'EXITED'; }
