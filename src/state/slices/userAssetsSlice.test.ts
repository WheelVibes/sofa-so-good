import { describe, it, expect, beforeEach, vi } from 'vitest';

// IDB + object-URL stubs (jsdom has neither).
const idbDelete = vi.fn().mockResolvedValue(undefined);
vi.mock('../storage/IdbAssetStore', () => ({
  IdbAssetStore: { delete: (...a: unknown[]) => idbDelete(...a), put: vi.fn() },
}));
(URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();

import { useStore } from '../store';
import type { IkeaGltfDef, FurnitureItem } from '../../furniture/types';

function ikeaDef(overrides: Partial<IkeaGltfDef> = {}): IkeaGltfDef {
  return {
    id: 'ikea-malm',
    name: 'MALM',
    category: 'beds',
    kind: 'gltf',
    source: 'ikea',
    groupKey: 'malm',
    activeVariant: 'black-brown',
    variants: [
      { finish: 'black-brown', label: 'Black-brown', articleNumber: '1', url: 'u',
        assetId: 'asset-old', runtimeUrl: 'blob:old', glbMaterials: [] },
    ],
    defaultFootprint: { w: 1, d: 2, h: 1 },
    uploadedAt: '2026-01-01',
    license: 'IKEA',
    attribution: 'IKEA — imported model',
    ...overrides,
  };
}

function placed(id: string, defId: string): FurnitureItem {
  return { id, defId, position: [1, 1], rotation: 0, props: { variant: 'black-brown' } };
}

beforeEach(() => {
  useStore.getState().__resetForTest();
  idbDelete.mockClear();
  (URL.revokeObjectURL as ReturnType<typeof vi.fn>).mockClear();
});

describe('replaceUserFurniture', () => {
  it('swaps the def in place and KEEPS placed instances (no data loss)', () => {
    const oldDef = ikeaDef();
    useStore.getState().addUserFurniture(oldDef);
    useStore.getState().setItems([placed('p1', 'ikea-malm'), placed('p2', 'ikea-malm')]);

    const newDef = ikeaDef({
      name: 'MALM (re-imported)',
      variants: [
        { finish: 'black-brown', label: 'Black-brown', articleNumber: '1', url: 'u',
          assetId: 'asset-new', runtimeUrl: 'blob:new', glbMaterials: [] },
      ],
    });
    useStore.getState().replaceUserFurniture(newDef);

    // Placed instances survive and still reference the (stable) def id.
    const items = useStore.getState().items;
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.defId === 'ikea-malm')).toBe(true);

    // The def itself was replaced (one entry, the new one).
    const defs = useStore.getState().userFurniture.filter((d) => d.id === 'ikea-malm');
    expect(defs).toHaveLength(1);
    expect(defs[0].name).toBe('MALM (re-imported)');

    // Old variant resources cleaned up.
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:old');
    expect(idbDelete).toHaveBeenCalledWith('asset-old');
  });

  it('does not revoke a blob URL that the new def still uses', () => {
    const shared = ikeaDef({
      variants: [
        { finish: 'black-brown', label: 'Black-brown', articleNumber: '1', url: 'u',
          assetId: 'asset-keep', runtimeUrl: 'blob:keep', glbMaterials: [] },
      ],
    });
    useStore.getState().addUserFurniture(shared);
    // Re-import resolved to the SAME assetId/runtimeUrl (e.g. nothing changed).
    useStore.getState().replaceUserFurniture(ikeaDef({
      name: 'same',
      variants: [
        { finish: 'black-brown', label: 'Black-brown', articleNumber: '1', url: 'u',
          assetId: 'asset-keep', runtimeUrl: 'blob:keep', glbMaterials: [] },
      ],
    }));
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:keep');
    expect(idbDelete).not.toHaveBeenCalledWith('asset-keep');
  });

  it('appends like add when no existing def shares the id', () => {
    useStore.getState().replaceUserFurniture(ikeaDef({ id: 'ikea-new' }));
    expect(useStore.getState().userFurniture.map((d) => d.id)).toContain('ikea-new');
  });
});
