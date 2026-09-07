import { constants, closeSync, fstatSync, openSync, readSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

// A DSH tool plugin, not a second tool dispatcher. All roles return changes in
// their business Result; only the application can commit them to CAS/workspaces.
export const inject = ['tools'];
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
