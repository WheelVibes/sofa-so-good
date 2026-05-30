import { describe, it, expect } from 'vitest';
import { parseMetadata } from './metadata';

const FIXTURE = {
  group_key: 'malm-bed-frame-high-90x200',
  product_name: 'MALM bed frame, high',
  type_name: 'bed frame, high',
  size: '90x200',
  series: 'MALM series',
  style_group: 'International Modern',
  designer: 'Eva',
  description: 'A clean design.',
  good_to_know: ['Mattress sold separately.'],
  category_hierarchy: ['Beds & mattresses', 'Bed frames'],
  design: { category: 'beds', category_confidence: 'high', placement: 'floor',
    semantics: { back_to_wall: true, front_clearance_m: 0 } },
  product_measurements: { Length: '209 cm' },
  compatibility: { accepts_categories: ['Spring mattresses'], size: '90x200', example_products: [] },
  variants: [
    { article_number: '40265178', finish: 'black-brown', url: 'https://x/p/1',
      price_numeral: 204, currency: 'SGD', rating: { value: 4.5, max: 5, count: 45 },
      glb: 'black-brown.glb', footprint: { w: 1.05, d: 2.09, h: 1.0, anchor_offset: [0, 0.5, 0] },
      glb_materials: [{ name: 'material_0', hex: '#ffffff', metallic: 1, roughness: 1, textured: true, sampled_hex: '#504c4b' }],
      glb_segments: [{ mesh: 'model', material: 'material_0' }] },
    { article_number: '20265179', finish: 'White', url: 'https://x/p/2', glb: null },
  ],
};

describe('parseMetadata', () => {
  it('parses a valid group', () => {
    const r = parseMetadata(FIXTURE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.group_key).toBe('malm-bed-frame-high-90x200');
    expect(r.data.variants).toHaveLength(2);
    expect(r.data.variants[1].glb).toBeNull();
  });
  it('rejects missing group_key', () => {
    const r = parseMetadata({ ...FIXTURE, group_key: undefined });
    expect(r.ok).toBe(false);
  });
  it('tolerates unknown extra keys', () => {
    const r = parseMetadata({ ...FIXTURE, some_future_field: 123 });
    expect(r.ok).toBe(true);
  });
});

describe('parseMetadata real-data tolerances', () => {
  const base = {
    group_key: 'g', product_name: 'P',
    design: { category: 'lighting', placement: 'ceiling' },
    variants: [{ article_number: '1', finish: 'a', url: 'u', glb: 'a.glb' }],
  };
  it('accepts glb_materials without a name', () => {
    const r = parseMetadata({ ...base, variants: [{ ...base.variants[0],
      glb_materials: [{ roughness: 2.96, textured: true, sampled_hex: '#cfd0cd' }] }] });
    expect(r.ok).toBe(true);
  });
  it('accepts glb_materials: [{ textured: true }] only', () => {
    const r = parseMetadata({ ...base, variants: [{ ...base.variants[0],
      glb_materials: [{ textured: true }] }] });
    expect(r.ok).toBe(true);
  });
  it('accepts glb_segments with null mesh/material', () => {
    const r = parseMetadata({ ...base, variants: [{ ...base.variants[0],
      glb_segments: [{ mesh: null, material: null }] }] });
    expect(r.ok).toBe(true);
  });
  it('accepts a variant with no finish field (single-SKU products)', () => {
    const r = parseMetadata({ ...base, variants: [{ article_number: '00437228',
      url: 'u', product_title: 'VINNSET Knob', glb: null }] });
    expect(r.ok).toBe(true);
  });
});
