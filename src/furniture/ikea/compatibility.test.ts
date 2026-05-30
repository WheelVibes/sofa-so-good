import { describe, it, expect } from 'vitest';
import { resolveCompatible } from './compatibility';
import type { IkeaGltfDef } from '../types';

function group(id: string, opts: {
  accepts?: string[]; size?: string; hierarchy?: string[]; typeName?: string; crawled?: boolean;
}): IkeaGltfDef {
  return {
    id: `ikea-${id}`, name: id, category: 'beds', kind: 'gltf', source: 'ikea', groupKey: id,
    activeVariant: 'a',
    variants: [{ finish: 'a', label: 'A', articleNumber: '1', url: 'u',
      assetId: opts.crawled === false ? null : 'x', glbMaterials: [] }],
    defaultFootprint: { w: 1, d: 1, h: 1 }, uploadedAt: 'x', license: 'IKEA', attribution: 'IKEA',
    productInfo: { categoryHierarchy: opts.hierarchy, typeName: opts.typeName, size: opts.size },
    compatibility: opts.accepts ? { acceptsCategories: opts.accepts, size: opts.size } : undefined,
  };
}

const bed = group('malm-bed', { accepts: ['Spring mattresses', 'Slatted bed bases'], size: '90x200' });
const mattressFit = group('valevag-mattress', { hierarchy: ['Mattresses', 'Spring mattresses'], size: '90x200' });
const mattressWrongSize = group('big-mattress', { hierarchy: ['Spring mattresses'], size: '150x200' });
const base = group('loenset-base', { hierarchy: ['Slatted bed bases'], size: '90x200' });
const lamp = group('lamp', { hierarchy: ['Lighting'], typeName: 'lamp' });
const uncrawled = group('ghost-mattress', { hierarchy: ['Spring mattresses'], size: '90x200', crawled: false });

describe('resolveCompatible', () => {
  it('matches a same-size mattress + base, by accepted category', () => {
    const out = resolveCompatible(bed, [bed, mattressFit, mattressWrongSize, base, lamp, uncrawled]);
    const springs = out['Spring mattresses'].map((g) => g.def.groupKey);
    expect(springs).toContain('valevag-mattress');
    expect(springs).not.toContain('big-mattress');   // wrong size
    expect(springs).not.toContain('ghost-mattress');  // no GLB
    expect(out['Slatted bed bases'].map((g) => g.def.groupKey)).toContain('loenset-base');
  });
  it('excludes the active group and non-matching categories', () => {
    const out = resolveCompatible(bed, [bed, lamp]);
    expect(Object.values(out).flat()).toHaveLength(0);
  });
  it('does not match a different whole-phrase that shares a word (Foam & latex vs Spring)', () => {
    // Both 'Foam & latex mattresses' and 'Spring mattresses' contain 'mattress',
    // but the accepted category must match the whole depluralised phrase, so a
    // foam/latex product must NOT satisfy a 'Spring mattresses' rule.
    const foamBed = group('foam-bed', { accepts: ['Foam & latex mattresses'], size: '90x200' });
    const springMattress = group('spring-mattress', { hierarchy: ['Spring mattresses'], size: '90x200' });
    const out = resolveCompatible(foamBed, [foamBed, springMattress]);
    expect(out['Foam & latex mattresses'].map((g) => g.def.groupKey)).not.toContain('spring-mattress');
    expect(Object.values(out).flat()).toHaveLength(0);
  });
});
