import { describe, it, expect } from 'vitest';
import { canPlace, itemFootprint } from './placement';
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog';
import { ROOMS } from '../apartment/constants';
import type { FurnitureItem } from '../furniture/types';

const sofa = BUILTIN_CATALOG['sofa-3seat'];
const bed = BUILTIN_CATALOG['bed-double'];

const placedSofa = (cx: number, cz: number, rot = 0): FurnitureItem => ({
  id: 's1',
  defId: 'sofa-3seat',
  position: [cx, cz],
  rotation: rot,
  props: {},
});

const placedBed = (cx: number, cz: number, rot = 0): FurnitureItem => ({
  id: 'b1',
  defId: 'bed-double',
  position: [cx, cz],
  rotation: rot,
  props: {},
});

const ctx = (others: FurnitureItem[] = []) => ({
  others,
  defs: BUILTIN_CATALOG,
  doors: {},
});

describe('placement', () => {
  it('itemFootprint reflects parametric width/depth overrides', () => {
    const item: FurnitureItem = {
      ...placedSofa(5, 5),
      props: { width: 1.5, depth: 0.85 },
    };
    const obb = itemFootprint(item, sofa);
    expect(obb.hx).toBeCloseTo(0.75);
    expect(obb.hz).toBeCloseTo(0.425);
  });

  it('itemFootprint multiplies the GLB defaultFootprint by def.scale exactly once', () => {
    // Pre-cache miss path: when no rendered GLB has populated the
    // module-level cache, itemFootprint falls back to def.defaultFootprint
    // and multiplies by def.scale. defaultFootprint is the RAW bbox, so
    // the result must equal raw × scale (not raw × scale²).
    const packDef: import('../furniture/types').PackGltfDef = {
      id: 'kenney-furniture-kit:bench',
      name: 'Bench',
      category: 'seating',
      kind: 'gltf',
      source: 'pack',
      packId: 'kenney-furniture-kit',
      entryId: 'bench',
      defaultFootprint: { w: 0.83, d: 0.225, h: 0.42 },
      scale: 1.8,
      runtimeUrl: undefined,
      license: 'CC0',
      attribution: 'Kenney',
      sourceUrl: 'https://example.test',
    };
    const item: FurnitureItem = {
      id: 'b1',
      defId: packDef.id,
      position: [3, 4],
      rotation: 0,
      props: {},
    };
    const obb = itemFootprint(item, packDef);
    expect(obb.hx).toBeCloseTo((0.83 * 1.8) / 2, 5);
    expect(obb.hz).toBeCloseTo((0.225 * 1.8) / 2, 5);
  });

  it('rejects placement that overlaps a wall', () => {
    // Place a sofa straddling the apartment's external south wall (z=0).
    const item: FurnitureItem = placedSofa(2, 0);
    expect(canPlace(item, sofa, ctx())).toBe(false);
  });

  it('accepts placement well inside a room', () => {
    const r = ROOMS.livingDining;
    const item: FurnitureItem = placedSofa(
      r.origin[0] + r.width / 2,
      r.origin[1] + r.depth / 2,
    );
    expect(canPlace(item, sofa, ctx())).toBe(true);
  });

  it('rejects two items overlapping', () => {
    const r = ROOMS.livingDining;
    const a = placedSofa(r.origin[0] + 1, r.origin[1] + 1);
    const b = placedBed(r.origin[0] + 1.2, r.origin[1] + 1);
    expect(canPlace(b, bed, ctx([a]))).toBe(false);
  });

  it('ignores the item itself when re-checking after a small move', () => {
    const r = ROOMS.livingDining;
    const a: FurnitureItem = {
      ...placedSofa(r.origin[0] + r.width / 2, r.origin[1] + r.depth / 2),
      id: 'same',
    };
    const moved: FurnitureItem = { ...a, position: [a.position[0] + 0.01, a.position[1]] };
    expect(canPlace(moved, sofa, ctx([a]))).toBe(true);
  });
});
