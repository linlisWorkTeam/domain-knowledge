/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：将有限 UTF-8 文本或网页材料转换为可审计正文。
 */
import type { MaterialTextExtractor } from '../../application/ports/ExternalMaterialPorts.ts';
export class MaterialText implements MaterialTextExtractor {
  extract(bytes: Uint8Array, mediaType: string): string {
    if (bytes.byteLength > 2_097_152) throw new Error('MATERIAL_SIZE_LIMIT');
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new Error('MATERIAL_ENCODING_UNSUPPORTED'); }
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw new Error('MATERIAL_FORMAT_UNSUPPORTED');
    const kind = mediaType.split(';', 1)[0]!.trim().toLowerCase();
    if (!['text/plain', 'text/markdown', 'text/html', 'application/xhtml+xml', 'application/json'].includes(kind)) throw new Error('MATERIAL_FORMAT_UNSUPPORTED');
    if (kind === 'text/html' || kind === 'application/xhtml+xml') {
      text = text.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
        .replace(/<\/(?:p|div|h[1-6]|li|tr|pre|section|article)\s*>|<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '')
        .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity: string) => {
          if (entity.startsWith('#')) { const number = entity[1]?.toLowerCase() === 'x' ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10); return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : match; }
          return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' } as Record<string, string>)[entity.toLowerCase()] ?? match;
        });
    }
    text = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, '\n\n').trim();
    if (!text) throw new Error('MATERIAL_EMPTY');
    return text;
  }
}
