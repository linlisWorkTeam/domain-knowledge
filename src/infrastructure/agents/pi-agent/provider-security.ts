import {
  chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync,
  renameSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { request as httpsRequest, type RequestOptions } from 'node:https';
import { dirname } from 'node:path';
import { isIP } from 'node:net';
import type {
  ProviderConnectionProbe,
  ProviderEndpoint,
  ProviderProbeResult,
  ProviderSettingsRecord,
  ProviderSettingsStore,
} from '../../../application/ports/index.ts';

export {
  isPublicAddress, PublicHttpsEndpointPolicy,
} from '../../security/public-https.ts';

interface SealedSettings {
  version: 1;
  iv: string;
  tag: string;
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

export class EncryptedFileProviderSettingsStore implements ProviderSettingsStore {
  readonly settingsPath: string;
  readonly keyPath: string;

  constructor(settingsPath: string, keyPath: string) {
    this.settingsPath = settingsPath;
    this.keyPath = keyPath;
  }

  load(): ProviderSettingsRecord | null {
    if (!existsSync(this.settingsPath)) return null;
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

export class OpenAiCompatibleProviderProbe implements ProviderConnectionProbe {
  readonly timeoutMs: number;

  constructor(timeoutMs = 10_000) {
    this.timeoutMs = timeoutMs;
  }

  verify(input: {
    endpoint: ProviderEndpoint;
    apiKey: string | null;
    model: string | null;
  }): Promise<ProviderProbeResult> {
    const target = new URL('models', input.endpoint.url);
    const approved = new Set(input.endpoint.addresses);
    const pinnedAddress = input.endpoint.addresses[0] as string;
    const targetHostname = input.endpoint.url.hostname.replace(/^\[|\]$/g, '');
    const options: RequestOptions = {
      protocol: 'https:',
      hostname: targetHostname,
      port: input.endpoint.url.port || 443,
      path: `${target.pathname}${target.search}`,
      method: 'GET',
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
