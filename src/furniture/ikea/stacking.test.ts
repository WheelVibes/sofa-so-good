import { describe, it, expect } from 'vitest';
import { resolveStack } from './stacking';
import type { IkeaGltfDef } from '../types';

function bedDef(): IkeaGltfDef {
  return {
    id: 'ikea-malm', name: 'MALM', category: 'beds', kind: 'gltf', source: 'ikea',
    groupKey: 'malm', activeVariant: 'black',
    variants: [{ finish: 'black', label: 'Black', articleNumber: '1', url: '', assetId: 'a',
      glbMaterials: [],
      footprint: { w: 1.0542, d: 2.09, h: 1.0041, anchorOffset: [0, 0.5021, 0] } }],
    defaultFootprint: { w: 1.0542, d: 2.09, h: 1.0041 },
    productInfo: { categoryHierarchy: [], productMeasurements: {
      'Footboard height': '38 cm', 'Mattress length': '200 cm',
      'Mattress width': '90 cm', 'Free height under furniture': '21 cm' } },
    compatibility: { acceptsCategories: ['Foam & latex mattresses'], size: '90x200' },
    uploadedAt: '', license: 'IKEA', attribution: 'IKEA',
  } as IkeaGltfDef;
}

function mattressDef(): IkeaGltfDef {
  return {
    id: 'ikea-vitmosen', name: 'VITMOSEN', category: 'beds', kind: 'gltf', source: 'ikea',
    groupKey: 'vitmosen', activeVariant: 'white',
    variants: [{ finish: 'white', label: 'White', articleNumber: '2', url: '', assetId: 'b',
      glbMaterials: [],
      footprint: { w: 1.506, d: 1.9155, h: 0.2543, anchorOffset: [-0.0001, 0.1263, 0.0001] } }],
    defaultFootprint: { w: 1.506, d: 1.9155, h: 0.2543 },
    productInfo: { categoryHierarchy: [] },
    uploadedAt: '', license: 'IKEA', attribution: 'IKEA',
  } as IkeaGltfDef;
}

describe('resolveStack', () => {
  it('sits a mattress so its top is flush with the footboard rail', () => {
    const base = bedDef();
    const top = mattressDef();
    const fit = resolveStack(base, base.variants[0], top, top.variants[0]);
    expect(fit).not.toBeNull();
    expect(fit!.supportY).toBeCloseTo(0.1257, 3); // 0.38 - 0.2543
    expect(fit!.supportY + top.variants[0].footprint!.h).toBeCloseTo(0.38, 2);
  });

  it('clamps supportY to at least free height under furniture', () => {
    const base = bedDef();
    base.productInfo!.productMeasurements!['Footboard height'] = '20 cm';
    const top = mattressDef();
    const fit = resolveStack(base, base.variants[0], top, top.variants[0]);
    expect(fit!.supportY).toBeGreaterThanOrEqual(0.21);
  });

  it('falls back to the slat-default height when no footboard field', () => {
    const base = bedDef();
    delete base.productInfo!.productMeasurements!['Footboard height'];
    const top = mattressDef();
    const fit = resolveStack(base, base.variants[0], top, top.variants[0]);
    expect(fit!.supportY).toBeCloseTo(0.13, 3);
  });

  it('centers the mattress on the base footprint (zero offset for a centered bed)', () => {
    const base = bedDef();
    const top = mattressDef();
    const fit = resolveStack(base, base.variants[0], top, top.variants[0]);
    expect(fit!.centerOffset[0]).toBeCloseTo(0, 2);
    expect(fit!.centerOffset[1]).toBeCloseTo(0, 2);
  });

  it('returns null for a non-stackable base category with no rule', () => {
    const base = mattressDef();
    base.compatibility = undefined;
    const top = mattressDef();
    expect(resolveStack(base, base.variants[0], top, top.variants[0])).toBeNull();
  });
});
