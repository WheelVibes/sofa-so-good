import { describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { isModelFile, modelName } from './bulkImport';

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
