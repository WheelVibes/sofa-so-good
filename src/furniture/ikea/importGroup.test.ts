import { describe, it, expect, vi, beforeEach } from 'vitest';

(URL as any).createObjectURL = vi.fn(() => 'blob:x');
(URL as any).revokeObjectURL = vi.fn();

const put = vi.fn().mockResolvedValue(undefined);
vi.mock('../../state/storage/IdbAssetStore', () => ({
  IdbAssetStore: { put: (...a: unknown[]) => put(...a), delete: vi.fn() },
}));
const added: any[] = [];
const state = {
  addUserFurniture: (d: unknown) => added.push(d),
  // importGroup now uses replaceUserFurniture (swap-or-append, keeps placements).
  replaceUserFurniture: (d: any) => {
    const i = state.userFurniture.findIndex((x) => x.id === d.id);
    if (i >= 0) state.userFurniture[i] = d;
    else state.userFurniture.push(d);
    added.push(d);
  },
  userFurniture: [] as any[],
  removeUserFurniture: vi.fn(),
};
vi.mock('../../state/store', () => ({ useStore: { getState: () => state } }));

import { importGroup } from './importGroup';
import { parseMetadata } from './metadata';

const META = {
  group_key: 'malm-bed-frame-high-90x200', product_name: 'MALM bed frame, high', type_name: 'bed frame, high',
  size: '90x200', series: 'MALM series', style_group: 'International Modern', designer: 'Eva',
  description: 'A clean design.', good_to_know: ['x'], category_hierarchy: ['Beds & mattresses', 'Bed frames'],
  design: { category: 'beds', category_confidence: 'high', placement: 'floor', semantics: { back_to_wall: true, front_clearance_m: 0 } },
  product_measurements: { Length: '209 cm' },
  compatibility: { accepts_categories: ['Spring mattresses'], size: '90x200', example_products: [] },
  variants: [
    { article_number: '40265178', finish: 'black-brown', url: 'https://x/p/1', price_numeral: 204, currency: 'SGD',
      rating: { value: 4.5, max: 5, count: 45 }, glb: 'black-brown.glb',
      footprint: { w: 1.05, d: 2.09, h: 1.0, anchor_offset: [0, 0.5, 0] },
      glb_materials: [{ name: 'material_0', hex: '#ffffff', metallic: 1, roughness: 1, textured: true, sampled_hex: '#504c4b' }],
      glb_segments: [{ mesh: 'model', material: 'material_0' }] },
    { article_number: '20265179', finish: 'White', url: 'https://x/p/2', glb: null },
  ],
};

function glb(name: string): File {
  const buf = new Uint8Array(64);
  new DataView(buf.buffer).setUint32(0, 0x46546c67, true);
  return new File([buf], name, { type: 'model/gltf-binary' });
}

function img(name: string): File {
  return new File([new Uint8Array([1, 2, 3, 4])], name, { type: 'image/jpeg' });
}

beforeEach(() => { put.mockClear(); added.length = 0; state.userFurniture = []; });

describe('importGroup', () => {
  it('builds a def with one crawled variant + one stub, writes one blob', async () => {
    const parsed = parseMetadata(META);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const r = await importGroup(parsed.data, [glb('black-brown.glb')]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.def.source).toBe('ikea');
    expect(r.def.variants).toHaveLength(2);
    expect(r.def.variants[0].assetId).toBeTruthy();
    expect(r.def.variants[1].assetId).toBeNull();
    expect(r.def.activeVariant).toBe('black-brown');
    expect(r.def.category).toBe('beds');
    expect(r.def.defaultFootprint.d).toBeCloseTo(2.09, 2);
    expect(put).toHaveBeenCalledTimes(1);
    expect(added).toHaveLength(1);
  });
  it('stores a downscaled thumbnail for the active variant when an image file is supplied', async () => {
    const meta = JSON.parse(JSON.stringify(META));
    meta.variants[0].main_image = 'black-brown-main.jpg';
    const parsed = parseMetadata(meta);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const r = await importGroup(parsed.data, [glb('black-brown.glb'), img('black-brown-main.jpg')]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const active = r.def.variants.find((v) => v.finish === 'black-brown')!;
    expect(active.imageAssetId).toBeTruthy();
    expect(active.runtimeImageUrl).toBe('blob:x');
    // one GLB blob + one image blob
    expect(put).toHaveBeenCalledTimes(2);
  });
  it('imports fine when no image file is present (imageAssetId null)', async () => {
    const parsed = parseMetadata(META);
    if (!parsed.ok) return;
    const r = await importGroup(parsed.data, [glb('black-brown.glb')]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const active = r.def.variants.find((v) => v.finish === 'black-brown')!;
    expect(active.imageAssetId ?? null).toBeNull();
  });
  it('preserves a real material name (incl. a real "material_0")', async () => {
    const parsed = parseMetadata(META);
    if (!parsed.ok) return;
    const r = await importGroup(parsed.data, [glb('black-brown.glb')]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.def.variants[0].glbMaterials[0].name).toBe('material_0');
  });
  it('maps an unnamed scraper material to an empty name (no dead recolour control)', async () => {
    const meta = {
      ...META,
      variants: [
        {
          ...META.variants[0],
          glb_materials: [{ hex: '#ffffff', metallic: 1, roughness: 1, textured: true, sampled_hex: '#504c4b' }],
        },
        META.variants[1],
      ],
    };
    const parsed = parseMetadata(meta);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const r = await importGroup(parsed.data, [glb('black-brown.glb')]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.def.variants[0].glbMaterials[0].name).toBe('');
  });
  it('fails when no crawled variant has a matching file', async () => {
    const parsed = parseMetadata(META);
    if (!parsed.ok) return;
    const r = await importGroup(parsed.data, []);
    expect(r.ok).toBe(false);
  });

  it('carries a modular block onto the def (and omits it when absent)', async () => {
    const modularMeta = {
      ...META,
      group_key: 'vimle-corner-section',
      product_name: 'VIMLE corner section',
      modular: { role: 'corner', mates: [{ edge: 'right', accepts: ['seat'] }] },
    };
    const parsed = parseMetadata(modularMeta);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const r = await importGroup(parsed.data, [glb('black-brown.glb')]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.def.modular).toEqual({ role: 'corner', mates: [{ edge: 'right', accepts: ['seat'] }] });

    // A non-modular import leaves modular undefined.
    const plain = parseMetadata(META);
    if (!plain.ok) return;
    const r2 = await importGroup(plain.data, [glb('black-brown.glb')]);
    expect(r2.ok && r2.def.modular).toBeUndefined();
  });
});
