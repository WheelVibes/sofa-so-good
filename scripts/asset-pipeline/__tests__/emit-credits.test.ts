import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emitCredits } from '../emit-credits';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'credits-test-'));
  mkdirSync(join(root, 'public/assets'), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('emitCredits', () => {
  it('writes CREDITS.json and CREDITS.md from manifest entries', () => {
    emitCredits({
      projectRoot: root,
      furniture: [
        {
          id: 'kenney-armchair',
          name: 'Armchair',
          attribution: 'Kenney',
          sourceUrl: 'https://kenney.nl',
          license: 'CC0',
        },
      ],
      materials: [
        {
          id: 'floor-wood-oak',
          name: 'Oak planks',
          attribution: 'Poly Haven',
          sourceUrl: 'https://polyhaven.com/a/wood_floor_deck',
          license: 'CC0',
        },
      ],
    });
    const json = JSON.parse(readFileSync(join(root, 'public/assets/CREDITS.json'), 'utf8'));
    expect(json.furniture[0].id).toBe('kenney-armchair');
    expect(json.materials[0].id).toBe('floor-wood-oak');
    const md = readFileSync(join(root, 'CREDITS.md'), 'utf8');
    expect(md).toContain('Kenney');
    expect(md).toContain('Poly Haven');
    expect(md).toContain('CC0');
  });
});
