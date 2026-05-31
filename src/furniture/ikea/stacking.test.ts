import { describe, it, expect } from 'vitest';
import { resolveStack, combineOnto } from './stacking';
import { seedGltfSupportPlane } from '../GltfModel';
import type { IkeaGltfDef, FurnitureItem } from '../types';

function tableDef(): IkeaGltfDef {
  return {
    id: 'ikea-voxlov', name: 'VOXLÖV', category: 'tables', kind: 'gltf', source: 'ikea',
    groupKey: 'voxlov', activeVariant: 'bamboo',
    variants: [{ finish: 'bamboo', label: 'Bamboo', articleNumber: '3', url: '', assetId: 'c',
      glbMaterials: [],
      footprint: { w: 1.8, d: 0.9, h: 0.74, anchorOffset: [0, 0.37, 0] } }],
    defaultFootprint: { w: 1.8, d: 0.9, h: 0.74 },
    productInfo: { categoryHierarchy: [] },
    compatibility: { acceptsCategories: ['Kitchen dining chairs'] },
    uploadedAt: '', license: 'IKEA', attribution: 'IKEA',
  } as IkeaGltfDef;
}

function chairDef(): IkeaGltfDef {
  return {
    id: 'ikea-voxlov-chair', name: 'VOXLÖV chair', category: 'seating', kind: 'gltf', source: 'ikea',
    groupKey: 'voxlov-chair', activeVariant: 'bamboo',
    variants: [{ finish: 'bamboo', label: 'Bamboo', articleNumber: '4', url: '', assetId: 'd',
      glbMaterials: [],
      footprint: { w: 0.45, d: 0.5, h: 0.85, anchorOffset: [0, 0.425, 0] } }],
    defaultFootprint: { w: 0.45, d: 0.5, h: 0.85 },
    productInfo: { categoryHierarchy: [] },
    uploadedAt: '', license: 'IKEA', attribution: 'IKEA',
  } as IkeaGltfDef;
}

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

describe('resolveStack (geometric support plane)', () => {
  it('rests the mattress BOTTOM on the detected slat plane', () => {
    const base = bedDef();
    seedGltfSupportPlane(base.variants[0].url ?? '', 0.25);
    const fit = resolveStack(base, base.variants[0], 'Foam & latex mattresses');
    expect(fit).not.toBeNull();
    expect(fit!.kind).toBe('vertical');
    expect(fit!.supportY).toBeCloseTo(0.25, 3); // bottom on the planks
  });

  it('falls back to STACK.bedSlatDefault when no plane detected', () => {
    const base = bedDef();
    seedGltfSupportPlane(base.variants[0].url ?? '', null);
    const fit = resolveStack(base, base.variants[0], 'Foam & latex mattresses');
    expect(fit!.supportY).toBeCloseTo(0.13, 3);
  });

  it('centers the mattress on the base footprint (zero offset for a centered bed)', () => {
    const base = bedDef();
    seedGltfSupportPlane(base.variants[0].url ?? '', 0.25);
    const fit = resolveStack(base, base.variants[0], 'Foam & latex mattresses');
    expect(fit!.centerOffset[0]).toBeCloseTo(0, 2);
    expect(fit!.centerOffset[1]).toBeCloseTo(0, 2);
  });

  it('returns null for a non-stackable base category with no rule', () => {
    const base = mattressDef();
    base.compatibility = undefined;
    expect(resolveStack(base, base.variants[0], 'Foam & latex mattresses')).toBeNull();
  });
});

describe('combineOnto', () => {
  it('vertical: returns a lifted, grouped item resting on the plane', () => {
    const base = bedDef();
    seedGltfSupportPlane(base.variants[0].url ?? '', 0.25);
    const baseItem: FurnitureItem = { id: 'frame', defId: base.id, position: [2, 3], rotation: 0, props: {} };
    const top = mattressDef();
    const res = combineOnto(baseItem, base, top, top.variants[0], 'Foam & latex mattresses');
    if (!('items' in res)) throw new Error('expected items');
    expect(res.items).toHaveLength(1);
    expect(res.items[0].props['surfaceHeight']).toBeCloseTo(0.25, 3);
    expect(res.items[0].props['variant']).toBe('white');
    expect(res.items[0].groupId).toBe(res.groupId);
  });

  it('vertical: reuses an existing base groupId', () => {
    const base = bedDef();
    seedGltfSupportPlane(base.variants[0].url ?? '', 0.25);
    const baseItem: FurnitureItem = { id: 'frame', defId: base.id, position: [0, 0], rotation: 0, groupId: 'g-existing', props: {} };
    const top = mattressDef();
    const res = combineOnto(baseItem, base, top, top.variants[0], 'Foam & latex mattresses');
    if (!('items' in res)) throw new Error('expected items');
    expect(res.groupId).toBe('g-existing');
    expect(res.items[0].groupId).toBe('g-existing');
  });

  it('around: places seating beside the base on the floor (no lift)', () => {
    const base = tableDef();
    const baseItem: FurnitureItem = { id: 'tbl', defId: base.id, position: [5, 5], rotation: 0, props: {} };
    const chair = chairDef();
    const res = combineOnto(baseItem, base, chair, chair.variants[0], 'Kitchen dining chairs');
    if (!('items' in res)) throw new Error('expected items');
    expect(res.items[0].props['surfaceHeight']).toBeUndefined(); // floor-standing
    const moved = res.items[0].position[0] !== 5 || res.items[0].position[1] !== 5;
    expect(moved).toBe(true);
    expect(res.items[0].groupId).toBe(res.groupId);
  });

  it('returns an error when no rule resolves', () => {
    const base = mattressDef();
    base.compatibility = undefined;
    const baseItem: FurnitureItem = { id: 'm', defId: base.id, position: [0, 0], rotation: 0, props: {} };
    const top = mattressDef();
    const res = combineOnto(baseItem, base, top, top.variants[0], 'Foam & latex mattresses');
    expect('error' in res).toBe(true);
  });

  it('fails soft (no throw) when a variant is missing', () => {
    const base = bedDef();
    seedGltfSupportPlane(base.variants[0].url ?? '', 0.25);
    const baseItem: FurnitureItem = { id: 'frame', defId: base.id, position: [0, 0], rotation: 0, props: {} };
    const top = mattressDef();
    const res = combineOnto(baseItem, base, top, undefined as unknown as IkeaGltfDef['variants'][number], 'Foam & latex mattresses');
    expect('error' in res).toBe(true);
  });
});
