import { describe, it, expect } from 'vitest';
import { selectGltfRender } from './gltfRender';
import type { FurnitureItem, IkeaGltfDef } from './types';

const def: IkeaGltfDef = {
  id: 'ikea-malm', name: 'MALM', category: 'beds', kind: 'gltf', source: 'ikea',
  groupKey: 'malm', activeVariant: 'bb',
  variants: [
    { finish: 'bb', label: 'BB', articleNumber: '1', url: 'u', assetId: 'a1', runtimeUrl: 'blob:bb', glbMaterials: [] },
    { finish: 'white', label: 'White', articleNumber: '2', url: 'u', assetId: 'a2', runtimeUrl: 'blob:white', glbMaterials: [] },
    { finish: 'oak', label: 'Oak', articleNumber: '3', url: 'u', assetId: null, glbMaterials: [] },
  ],
  defaultFootprint: { w: 1, d: 2, h: 1 }, uploadedAt: 'x', license: 'IKEA', attribution: 'IKEA',
};
function item(props: Record<string, string | number> = {}): FurnitureItem {
  return { id: 'i1', defId: def.id, position: [0, 0], rotation: 0, props };
}
describe('selectGltfRender (ikea)', () => {
  it('uses default variant URL when no props.variant', () => {
    expect(selectGltfRender(item(), def)?.url).toBe('blob:bb');
  });
  it('uses props.variant URL when set + crawled', () => {
    expect(selectGltfRender(item({ variant: 'white' }), def)?.url).toBe('blob:white');
  });
  it('falls back to default when props.variant is a stub (no glb)', () => {
    expect(selectGltfRender(item({ variant: 'oak' }), def)?.url).toBe('blob:bb');
  });
  it('composes finishOverrides from finish:<name> props', () => {
    const r = selectGltfRender(item({ 'finish:material_0': '#abcdef' }), def);
    expect(r?.finishOverrides).toEqual({ material_0: '#abcdef' });
  });
});
