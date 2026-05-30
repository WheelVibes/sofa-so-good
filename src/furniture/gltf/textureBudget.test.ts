import { describe, it, expect, vi } from 'vitest';
import { Mesh, MeshStandardMaterial, Texture, BufferGeometry } from 'three';
import { applyTextureBudget } from './textureBudget';

function meshWithTexture(w: number, h: number) {
  const tex = new Texture();
  tex.image = { width: w, height: h } as unknown as HTMLImageElement;
  const mat = new MeshStandardMaterial();
  mat.map = tex;
  const mesh = new Mesh(new BufferGeometry(), mat);
  return { mesh, tex, mat };
}

describe('applyTextureBudget', () => {
  it('is a no-op on high', () => {
    const { mesh, tex } = meshWithTexture(2048, 2048);
    const spy = vi.fn();
    applyTextureBudget(mesh, 'high', spy);
    expect(spy).not.toHaveBeenCalled();
    expect((tex.image as { width: number }).width).toBe(2048);
  });

  it('resizes textures above the tier cap', () => {
    const { mesh, tex } = meshWithTexture(2048, 1024);
    const resized: Array<[Texture, number]> = [];
    applyTextureBudget(mesh, 'low', (t, cap) => {
      resized.push([t, cap]);
      return { width: 512, height: 256 } as unknown as HTMLCanvasElement;
    });
    expect(resized).toEqual([[tex, 512]]);
    expect(tex.needsUpdate).toBe(true);
  });

  it('leaves textures already within budget alone', () => {
    const { mesh } = meshWithTexture(256, 256);
    const spy = vi.fn();
    applyTextureBudget(mesh, 'low', spy);
    expect(spy).not.toHaveBeenCalled();
  });

  it('skips textures with no intrinsic size', () => {
    const tex = new Texture();
    tex.image = {} as unknown as HTMLImageElement;
    const mat = new MeshStandardMaterial();
    mat.map = tex;
    const mesh = new Mesh(new BufferGeometry(), mat);
    const spy = vi.fn();
    applyTextureBudget(mesh, 'low', spy);
    expect(spy).not.toHaveBeenCalled();
  });
});
