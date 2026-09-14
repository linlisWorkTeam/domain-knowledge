/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：锚定目录描述符读取删除清单中的CAS工件，识别缺失但拒绝链接和损坏。
 */
import { constants, closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { sha256 } from '../../domain/Domain.ts';
import type { DeletionArtifactReader } from '../../application/ports/DeletionArtifactPorts.ts';

export class CasDeletionReader implements DeletionArtifactReader {
  private readonly root: string;
  constructor(root: string) { this.root = root; }
  async read(artifactId: string, maxBytes: number): Promise<Uint8Array | null> {
    return this.visit(artifactId, maxBytes, file => file.bytes);
  }
  /** 同步回调期间保持目录及文件句柄，调用者仍须排除其他写入进程。 */
  protected visit<T>(artifactId: string, maxBytes: number,
    consume: (file: { bytes: Buffer; handle: number; parent: number; name: string;
      verified: { dev: bigint; ino: bigint; size: bigint; mtimeNs: bigint; ctimeNs: bigint } }) => T,
    missing?: (parent: number) => void): T | null {
    if (!/^sha256:[a-f0-9]{64}$/.test(artifactId)) throw new Error('DELETION_ARTIFACT_ID_INVALID');
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes > 32 * 1024 * 1024) throw new Error('DELETION_ARTIFACT_LIMIT');
    if (process.platform !== 'linux') throw new Error('DELETION_ARTIFACT_PLATFORM_UNSUPPORTED');
    const handles: number[] = [], directoryFlags = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
    try {
      // 根目录本身不可缺失；否则不能把配置错误解释成所有历史文件均不存在。
      handles.push(openSync(this.root, directoryFlags));
      const digest = artifactId.slice(7);
      for (const name of ['sha256', digest.slice(0, 2), digest]) {
        try {
          const flags = name === digest ? constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK : directoryFlags;
          handles.push(openSync(`/proc/self/fd/${handles.at(-1)!}/${name}`, flags));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') { missing?.(handles.at(-1)!); return null; }
          throw new Error('DELETION_ARTIFACT_ACCESS_FAILED');
        }
      }
      const handle = handles.at(-1)!, before = fstatSync(handle, { bigint: true });
      if (!before.isFile()) throw new Error('DELETION_ARTIFACT_NOT_REGULAR');
      if (before.size > BigInt(maxBytes)) throw new Error('DELETION_ARTIFACT_LIMIT');
      const bytes = Buffer.alloc(Number(before.size)); let offset = 0;
      while (offset < bytes.length) {
        const count = readSync(handle, bytes, offset, bytes.length - offset, offset);
        if (!count) throw new Error('DELETION_ARTIFACT_CHANGED');
        offset += count;
      }
      if (readSync(handle, Buffer.alloc(1), 0, 1, offset) !== 0) throw new Error('DELETION_ARTIFACT_CHANGED');
      const after = fstatSync(handle, { bigint: true });
      if (before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) throw new Error('DELETION_ARTIFACT_CHANGED');
      if (sha256(bytes) !== digest) throw new Error('DELETION_ARTIFACT_CORRUPT');
      return consume({ bytes, handle, parent: handles.at(-2)!, name: digest, verified: after });
    } finally { for (const handle of handles.reverse()) closeSync(handle); }
  }
}
