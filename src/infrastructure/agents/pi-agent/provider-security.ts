import {
  chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync,
  renameSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpsRequest, type RequestOptions } from 'node:https';
import { dirname } from 'node:path';
import { isIP } from 'node:net';
import type {
  ProviderConnectionProbe,
  ProviderEndpoint,
  ProviderEndpointPolicy,
  ProviderProbeResult,
  ProviderSettingsRecord,
  ProviderSettingsStore,
} from '../../../application/ports/index.ts';

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

function ipv4IsPublic(address: string): boolean {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return false;
  const [a = 0, b = 0, c = 0] = octets;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 0 || (b === 168))) return false;
  if (a === 192 && b === 0 && c === 2) return false;
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function ipv6IsPublic(address: string): boolean {
  const normalized = address.toLowerCase().split('%', 1)[0] ?? '';
  if (normalized.startsWith('::ffff:')) return ipv4IsPublic(normalized.slice('::ffff:'.length));
  if (normalized === '::' || normalized === '::1' || normalized.startsWith('2001:db8:')) return false;
  if (/^f[cd]/.test(normalized) || /^fe[89ab]/.test(normalized)) return false;
  const first = Number.parseInt(normalized.split(':', 1)[0] ?? '', 16);
  return Number.isFinite(first) && first >= 0x2000 && first <= 0x3fff;
}

export function isPublicAddress(address: string): boolean {
  return isIP(address) === 4 ? ipv4IsPublic(address)
    : isIP(address) === 6 ? ipv6IsPublic(address) : false;
}

export class PublicHttpsEndpointPolicy implements ProviderEndpointPolicy {
  readonly lookup: (hostname: string) => Promise<readonly string[]>;

  constructor(lookup: (hostname: string) => Promise<readonly string[]> = async (hostname) => (
    (await dnsLookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address)
  )) {
    this.lookup = lookup;
  }

  async validate(apiUrl: string): Promise<ProviderEndpoint> {
    let url: URL;
    try {
      url = new URL(apiUrl.trim());
    } catch (error) {
      throw new Error('PROVIDER_URL_INVALID: API URL is invalid', { cause: error });
    }
    if (url.protocol !== 'https:') throw new Error('PROVIDER_URL_INVALID: API URL must use HTTPS');
    if (url.username || url.password || url.hash || url.search) {
      throw new Error('PROVIDER_URL_INVALID: credentials, query, and fragment are forbidden');
    }
    const rawHostname = url.hostname.toLowerCase().replace(/\.$/, '');
    const hostname = rawHostname.startsWith('[') && rawHostname.endsWith(']')
      ? rawHostname.slice(1, -1) : rawHostname;
    if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')
      || hostname.endsWith('.local') || hostname === 'metadata.google.internal') {
      throw new Error('PROVIDER_URL_DENIED: local and metadata destinations are forbidden');
    }
    let addresses: readonly string[];
    if (isIP(hostname)) addresses = [hostname];
    else {
      try {
        addresses = [...new Set(await this.lookup(hostname))];
      } catch (error) {
        throw new Error('PROVIDER_URL_UNREACHABLE: API host cannot be resolved', { cause: error });
      }
    }
    if (addresses.length === 0) throw new Error('PROVIDER_URL_UNREACHABLE: API host has no address');
    if (addresses.some((address) => !isPublicAddress(address))) {
      throw new Error('PROVIDER_URL_DENIED: API host resolves to a restricted address');
    }
    url.hostname = isIP(hostname) === 6 ? `[${hostname}]` : hostname;
    url.pathname = `${url.pathname.replace(/\/+$/, '') || ''}/`;
    return { url, addresses };
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
