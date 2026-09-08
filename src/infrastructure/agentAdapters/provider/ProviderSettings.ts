/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：提供提供方设置的基础设施实现与外部系统接入。
 */
import {
  chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync,
  renameSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { request as httpsRequest, type RequestOptions } from 'node:https';
import { dirname } from 'node:path';
import { isIP, type TcpNetConnectOpts } from 'node:net';
import type {
  ProviderConnectionProbe,
  ProviderEndpoint,
  ProviderProbeResult,
  ProviderSettingsRecord,
  ProviderSettingsStore,
} from '../../../application/ports/ApplicationPorts.ts';

/** 统一导出本模块的公共符号，供其他层通过明确入口引用。 */
export {
  isPublicAddress, PublicHttpsEndpointPolicy,
} from '../../http/PublicHttps.ts';

interface SealedSettings {
  /** 提供版本信息，供调用方读取或传入。 */
  version: 1;
  /** 提供iv信息，供调用方读取或传入。 */
  iv: string;
  /** 提供tag信息，供调用方读取或传入。 */
  tag: string;
  /** 提供ciphertext信息，供调用方读取或传入。 */
  ciphertext: string;
}

function ensurePrivateFile(path: string, bytes: Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.tmp-${randomUUID()}`;
  let handle: number | null = null;
  try {
    handle = openSync(temporary, 'wx', 0o600);
    writeFileSync(handle, bytes);
    fsyncSync(handle);
    closeSync(handle);
    handle = null;
    renameSync(temporary, path);
    if (process.platform !== 'win32') chmodSync(path, 0o600);
  } finally {
    if (handle !== null) closeSync(handle);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

/** 封装Encrypted文件提供方设置存储的对外操作与协作依赖。 */
export class EncryptedFileProviderSettingsStore implements ProviderSettingsStore {
  /** 提供settings路径信息，供调用方读取或传入。 */
  readonly settingsPath: string;
  /** 提供键路径信息，供调用方读取或传入。 */
  readonly keyPath: string;

  /** 提供legacy信息，供调用方读取或传入。 */
  readonly legacy?: ProviderSettingsStore;

  /** 注入协作依赖并初始化实例状态。 */
  constructor(settingsPath: string, keyPath: string, legacy?: ProviderSettingsStore) {
    this.legacy = legacy;
    this.settingsPath = settingsPath;
    this.keyPath = keyPath;
  }

  /** 加载请求。 */
  load(): ProviderSettingsRecord | null {
    if (!existsSync(this.settingsPath)) return this.legacy?.load() ?? null;
    try {
      const sealed = JSON.parse(readFileSync(this.settingsPath, 'utf8')) as SealedSettings;
      if (sealed.version !== 1) throw new Error('unsupported version');
      const key = this.readKey(false);
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(sealed.iv, 'base64url'));
      decipher.setAuthTag(Buffer.from(sealed.tag, 'base64url'));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(sealed.ciphertext, 'base64url')),
        decipher.final(),
      ]);
      return JSON.parse(plaintext.toString('utf8')) as ProviderSettingsRecord;
    } catch (error) {
      throw new Error('PROVIDER_SETTINGS_CORRUPT: encrypted Provider settings cannot be read', { cause: error });
    }
  }

  /** 保存请求。 */
  save(record: ProviderSettingsRecord): void {
    const key = this.readKey(true);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(JSON.stringify(record), 'utf8')),
      cipher.final(),
    ]);
    const sealed: SealedSettings = {
      version: 1,
      iv: iv.toString('base64url'),
      tag: cipher.getAuthTag().toString('base64url'),
      ciphertext: ciphertext.toString('base64url'),
    };
    ensurePrivateFile(this.settingsPath, Buffer.from(JSON.stringify(sealed), 'utf8'));
  }

  private readKey(create: boolean): Buffer {
    if (!existsSync(this.keyPath)) {
      if (!create) throw new Error('missing encryption key');
      ensurePrivateFile(this.keyPath, randomBytes(32));
    }
    if (process.platform !== 'win32') chmodSync(this.keyPath, 0o600);
    const key = readFileSync(this.keyPath);
    if (key.byteLength !== 32) throw new Error('invalid encryption key');
    return key;
  }
}

function modelIds(value: unknown): string[] {
  if (!value || typeof value !== 'object' || !('data' in value) || !Array.isArray(value.data)) return [];
  return value.data.flatMap((entry) => (
    entry && typeof entry === 'object' && 'id' in entry && typeof entry.id === 'string' && entry.id.trim()
      ? [entry.id.trim()] : []
  ));
}

/** 封装OpenAiCompatible提供方Probe的对外操作与协作依赖。 */
export class OpenAiCompatibleProviderProbe implements ProviderConnectionProbe {
  /** 提供超时毫秒信息，供调用方读取或传入。 */
  readonly timeoutMs: number;

  /** 注入协作依赖并初始化实例状态。 */
  constructor(timeoutMs = 10_000) {
    this.timeoutMs = timeoutMs;
  }

  /** 验证请求。 */
  verify(input: {
    endpoint: ProviderEndpoint;
    apiKey: string | null;
    model: string | null;
  }): Promise<ProviderProbeResult> {
    const target = new URL('models', input.endpoint.url);
    const approved = new Set(input.endpoint.addresses);
    const pinnedAddress = input.endpoint.addresses[0] as string;
    const targetHostname = input.endpoint.url.hostname.replace(/^\[|\]$/g, '');
    const options: RequestOptions & Pick<TcpNetConnectOpts, 'autoSelectFamily'> = {
      protocol: 'https:',
      hostname: targetHostname,
      port: input.endpoint.url.port || 443,
      path: `${target.pathname}${target.search}`,
      method: 'GET',
      // The approved lookup returns one pinned address, not an all-address array.
      autoSelectFamily: false,
      ...(isIP(targetHostname) ? {} : { servername: targetHostname }),
      headers: {
        accept: 'application/json',
        'user-agent': 'domain-knowledge-provider-verifier/1.0',
        ...(input.apiKey ? { authorization: `Bearer ${input.apiKey}` } : {}),
      },
      lookup: ((_hostname: string, _options: unknown, callback: (...args: unknown[]) => void) => {
        if (!approved.has(pinnedAddress)) {
          callback(new Error('PROVIDER_URL_DENIED'));
          return;
        }
        callback(null, pinnedAddress, isIP(pinnedAddress));
      }) as RequestOptions['lookup'],
    };
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: ProviderProbeResult) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      const request = httpsRequest(options, (response) => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on('data', (chunk: Buffer) => {
          bytes += chunk.byteLength;
          if (bytes > 65_536) request.destroy(new Error('PROVIDER_RESPONSE_LIMIT'));
          else chunks.push(Buffer.from(chunk));
        });
        response.on('end', () => {
          const status = response.statusCode ?? 0;
          if (status === 401) return finish({ status: 'FAILED', reasonCode: 'PROVIDER_AUTH_INVALID', model: input.model });
          if (status === 403) return finish({ status: 'FAILED', reasonCode: 'PROVIDER_AUTH_DENIED', model: input.model });
          if (status === 404) return finish({ status: 'FAILED', reasonCode: 'PROVIDER_ENDPOINT_UNSUPPORTED', model: input.model });
          if (status === 429) return finish({ status: 'FAILED', reasonCode: 'PROVIDER_RATE_LIMITED', model: input.model });
          if (status < 200 || status >= 300) {
            return finish({ status: 'FAILED', reasonCode: 'PROVIDER_UNAVAILABLE', model: input.model });
          }
          try {
            const ids = modelIds(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            if (ids.length === 0) return finish({ status: 'FAILED', reasonCode: 'PROVIDER_RESPONSE_INVALID', model: input.model });
            if (input.model && !ids.includes(input.model)) {
              return finish({ status: 'FAILED', reasonCode: 'PROVIDER_MODEL_UNAVAILABLE', model: input.model });
            }
            return finish({ status: 'VERIFIED', reasonCode: 'READY', model: input.model ?? ids[0] as string });
          } catch {
            return finish({ status: 'FAILED', reasonCode: 'PROVIDER_RESPONSE_INVALID', model: input.model });
          }
        });
      });
      request.setTimeout(this.timeoutMs, () => request.destroy(new Error('PROVIDER_TIMEOUT')));
      request.on('error', (error) => finish({
        status: 'FAILED',
        reasonCode: error.message === 'PROVIDER_TIMEOUT' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNREACHABLE',
        model: input.model,
      }));
      request.end();
    });
  }
}
