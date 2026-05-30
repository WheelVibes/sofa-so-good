import { describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { dedupeName, isModelFile, modelName } from './bulkImport';

describe('bulkImport file filtering', () => {
  it('recognises .glb and .gltf case-insensitively, rejects others', () => {
    expect(isModelFile('chair.glb')).toBe(true);
    expect(isModelFile('CHAIR.GLTF')).toBe(true);
    expect(isModelFile('readme.txt')).toBe(false);
    expect(isModelFile('texture.png')).toBe(false);
    expect(isModelFile('noext')).toBe(false);
  });

  it('derives a display name from the basename without extension', () => {
    expect(modelName('chair.glb')).toBe('chair');
    expect(modelName('models/sofas/Big Sofa.gltf')).toBe('Big Sofa');
    expect(modelName('a.b.glb')).toBe('a.b');
  });
});

describe('bulkImport name dedupe', () => {
  it('returns the name unchanged when unused', () => {
    const used = new Set<string>();
    expect(dedupeName('Chair', used)).toBe('Chair');
  });

  it('suffixes (2), (3) on collision and reserves each result', () => {
    const used = new Set<string>(['Chair']);
    expect(dedupeName('Chair', used)).toBe('Chair (2)');
    expect(dedupeName('Chair', used)).toBe('Chair (3)');
    expect(dedupeName('Sofa', used)).toBe('Sofa');
  });
});
