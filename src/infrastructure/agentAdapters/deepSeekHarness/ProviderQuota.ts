/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：区分额度与限流，并跨角色和重启保留额度停止状态。
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
const stopped = new Map<string, string>();
/** 只接受固定机器码；不根据自由文本推测余额，也不输出错误正文。 */
export function providerErrorCode(status: number, body: string): string {
  let code = '';
  try { const error = JSON.parse(body)?.error; code = String(error?.code ?? error?.type ?? '').toLowerCase(); } catch {}
  if (['insufficient_quota', 'quota_exceeded', 'credit_balance_too_low'].includes(code)) return 'PROVIDER_QUOTA_EXHAUSTED';
  return ({ 401: 'PROVIDER_AUTH_INVALID', 402: 'PROVIDER_PAYMENT_REQUIRED', 403: 'PROVIDER_AUTH_DENIED',
    404: 'PROVIDER_ENDPOINT_UNSUPPORTED', 429: 'PROVIDER_RATE_LIMITED' } as Record<number, string>)[status] ?? 'DSH_PROVIDER_REQUEST_FAILED';
}
/** 停止目录先于原因文件创建；原因落盘失败也保持关闭，不自动因配置 revision 变化解锁。 */
export class ProviderQuotaStop {
  private path: string;
  constructor(home: string, credential: { apiUrl: string; apiKey?: string | null; model?: string | null }) {
    const key = createHash('sha256').update(JSON.stringify([new URL(credential.apiUrl).href.replace(/\/+$/, ''), credential.apiKey])).digest('hex');
    this.path = join(home, 'quota-stops', key);
  }
  /** 每次上游调用前检查，后续新角色与进程同样受约束。 */
  assertAvailable(): void {
    if (stopped.has(this.path)) throw new Error(stopped.get(this.path));
    try { mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 }); }
    catch { throw new Error('PROVIDER_QUOTA_STOP_UNAVAILABLE'); }
    if (!existsSync(this.path)) return;
    let code = 'PROVIDER_QUOTA_STOP_UNAVAILABLE';
    try { const value = JSON.parse(readFileSync(join(this.path, 'Reason.json'), 'utf8'));
      if (['PROVIDER_QUOTA_EXHAUSTED', 'PROVIDER_PAYMENT_REQUIRED'].includes(value.code)) code = value.code;
    } catch {}
    stopped.set(this.path, code); throw new Error(code);
  }
  /** 仅额度耗尽或支付拒绝形成持久停止；临时限流不写永久状态。 */
  record(code: string): void {
    if (!['PROVIDER_QUOTA_EXHAUSTED', 'PROVIDER_PAYMENT_REQUIRED'].includes(code)) return;
    stopped.set(this.path, code);
    try {
      mkdirSync(this.path, { recursive: true, mode: 0o700 });
      writeFileSync(join(this.path, 'Reason.json'), JSON.stringify({ code, recordedAt: new Date().toISOString() }), { flag: 'wx', mode: 0o600, flush: true });
    } catch { throw new Error('PROVIDER_QUOTA_STOP_UNAVAILABLE'); }
  }
}
