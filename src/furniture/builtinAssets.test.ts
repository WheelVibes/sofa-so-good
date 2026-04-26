import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { BUILTIN_CATALOG } from './builtinCatalog';

const PROJECT_ROOT = resolve(__dirname, '../../');

/**
 * For every built-in gltf def, assert the referenced GLB file exists on
 * disk under public/ AND starts with the GLB magic bytes. Catches
 * missing or truncated bundles before the runtime user does.
 */
describe('built-in GLB asset files', () => {
  const builtinGltfs = Object.values(BUILTIN_CATALOG).flatMap((d) =>
    d.kind === 'gltf' && d.source === 'builtin' ? [d] : [],
  );

  if (builtinGltfs.length === 0) {
    it.skip('no built-in GLB defs to verify', () => {});
    return;
  }

  for (const def of builtinGltfs) {
    it(`${def.id}: file exists and starts with the GLB magic header`, async () => {
      const path = resolve(PROJECT_ROOT, 'public' + def.url);
      const buf = await readFile(path);
      expect(buf.length).toBeGreaterThan(12);
      // 'glTF' little-endian = 0x46546C67
      expect(buf.readUInt32LE(0)).toBe(0x46546c67);
    });
  }
});
