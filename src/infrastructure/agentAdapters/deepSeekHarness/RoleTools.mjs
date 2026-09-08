/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：为 DSH 注册受限的只读材料工具，按角色权限校验工作区内的文件访问。
 */
import { constants, closeSync, fstatSync, openSync, readSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

// A DSH tool plugin, not a second tool dispatcher. All roles return changes in
// their business Result; only the application can commit them to CAS/workspaces.
/** 对外提供inject，作为调用方使用的统一约定。 */
export const inject = ['tools'];
/** 向 DSH 注册 read_material 工具，只允许读取已授权工作区内的普通文件。 */
export function apply(ctx, config) {
  const root = realpathSync(config.workspaceRoot);
  ctx.tools.guard((exec) => config.canRead !== false && exec.name === 'read_material' ? undefined : 'DSH_ROLE_TOOL_DENIED');
  if (config.canRead === false) return;
  ctx.tools.register({
    name: 'read_material',
    description: 'Read an authorized UTF-8 material file, in bounded byte windows.',
    parameters: {
      type: 'object', additionalProperties: false, required: ['path'],
      properties: {
        path: { type: 'string' },
        offset: { type: 'integer', minimum: 0 },
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      exec.signal?.throwIfAborted();
      let file;
      try { file = realpathSync(resolve(root, args.path)); }
      catch { throw new Error('DSH_MATERIAL_UNAVAILABLE'); }
      const path = relative(root, file);
      if (path === '' || path.startsWith('..') || isAbsolute(path)
        || path.split('/').some((part) => part.startsWith('.'))) {
        throw new Error('DSH_MATERIAL_DENIED');
      }
      const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        if (!fstatSync(fd).isFile()) throw new Error('DSH_MATERIAL_DENIED');
        const buffer = Buffer.alloc(32 * 1024);
        return buffer.subarray(0, readSync(fd, buffer, 0, buffer.length, args.offset ?? 0)).toString('utf8');
      } finally { closeSync(fd); }
    },
  });
}
