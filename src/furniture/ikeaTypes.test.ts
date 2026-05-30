import { describe, it, expect } from 'vitest';
import type { IkeaGltfDef } from './types';

describe('IkeaGltfDef', () => {
  it('constructs a minimal valid def', () => {
    const def: IkeaGltfDef = {
      id: 'ikea-malm-bed-frame-high-90x200',
      name: 'MALM bed frame, high',
      category: 'beds',
      kind: 'gltf',
      source: 'ikea',
      groupKey: 'malm-bed-frame-high-90x200',
      activeVariant: 'black-brown',
      variants: [
        {
          finish: 'black-brown',
          label: 'Black-brown',
          articleNumber: '40265178',
          url: 'https://ikea.example/p/40265178',
          assetId: 'asset-1',
          glbMaterials: [{ name: 'material_0', hex: '#fff', metallic: 1, roughness: 1, textured: true }],
        },
      ],
      defaultFootprint: { w: 1.05, d: 2.09, h: 1.0 },
      uploadedAt: new Date().toISOString(),
      license: 'IKEA',
      attribution: 'IKEA — imported model',
    };
    expect(def.variants[0].finish).toBe('black-brown');
    expect(def.source).toBe('ikea');
  });
});
