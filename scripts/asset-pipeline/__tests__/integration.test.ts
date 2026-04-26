import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, copyFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { processGlb } from '../process-glb';
import { writeSidecar } from '../sidecar';
import { indexAssets } from '../index-assets';
import { emitCredits } from '../emit-credits';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'integration-test-'));
  mkdirSync(join(root, 'public/assets/furniture'), { recursive: true });
  mkdirSync(join(root, 'src/furniture'), { recursive: true });
  mkdirSync(join(root, 'src/materials'), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('asset pipeline integration', () => {
  it('produces a generated catalog and CREDITS.json from one fixture entry', async () => {
    const src = 'public/assets/furniture/demo-duck.glb';
    const dst = join(root, 'public/assets/furniture/fixture-duck.glb');
    await processGlb(src, dst, { compress: false });
    writeSidecar(dst, {
      id: 'fixture-duck',
      name: 'Fixture duck',
      category: 'decor',
      footprint: { w: 0.6, d: 0.6, h: 1.0 },
      scale: 1.0,
      anchor: 'floor-center',
      license: 'CC0',
      attribution: 'Khronos',
      sourceUrl: 'https://example.test/duck',
    });
    await indexAssets({ projectRoot: root });
    emitCredits({
      projectRoot: root,
      furniture: [
        {
          id: 'fixture-duck',
          name: 'Fixture duck',
          attribution: 'Khronos',
          sourceUrl: 'https://example.test/duck',
          license: 'CC0',
        },
      ],
      materials: [],
    });
    const generated = readFileSync(join(root, 'src/furniture/generatedCatalog.ts'), 'utf8');
    expect(generated).toContain('"fixture-duck"');
    const credits = JSON.parse(readFileSync(join(root, 'public/assets/CREDITS.json'), 'utf8'));
    expect(credits.furniture[0].id).toBe('fixture-duck');
  });
});
