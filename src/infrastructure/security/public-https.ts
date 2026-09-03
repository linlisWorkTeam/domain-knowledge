import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Agent as UndiciAgent } from 'undici';
import type {
  ProviderEndpoint, ProviderEndpointPolicy,
} from '../../application/ports/index.ts';

function ipv4IsPublic(address: string): boolean {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4
    || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return false;
  const [a = 0, b = 0, c = 0] = octets;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 0 || b === 168)) return false;
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

/** Resolves an HTTPS endpoint once and rejects any restricted or mixed DNS answer. */
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

/** Creates a dispatcher whose socket lookup cannot escape the addresses approved above. */
export function createPinnedHttpsDispatcher(
  endpoint: ProviderEndpoint,
  maxResponseSize = 2 * 1024 * 1024,
): UndiciAgent {
  const approved = new Set(endpoint.addresses);
  const pinnedAddress = endpoint.addresses[0];
  if (!pinnedAddress) throw new Error('PROVIDER_URL_UNREACHABLE: approved endpoint has no address');
  return new UndiciAgent({
    maxResponseSize,
    autoSelectFamily: false,
    connect: {
      lookup: (_hostname, _options, callback) => {
        if (!approved.has(pinnedAddress)) {
          callback(new Error('PROVIDER_URL_DENIED'), '', 0);
          return;
        }
        callback(null, pinnedAddress, isIP(pinnedAddress));
      },
    },
  });
}
