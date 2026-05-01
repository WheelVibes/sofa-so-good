import { describe, expect, it, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { hydratePacks } from './hydratePacks';
import { InstalledPackStore } from '../../catalog/packs/installedPackStore';
import { IdbAssetStore } from './IdbAssetStore';
import { useStore } from '../store';
import type { InstalledPack } from '../../catalog/packs/types';

const duckBytes = readFileSync(
  resolve(__dirname, '../../../scripts/asset-pipeline/__tests__/fixtures/duck.glb'),
);

async function seedLegacyInstall(): Promise<void> {
  // A pack manifest that pre-dates the per-id scale field. The persisted
  // footprint here is the raw GLB bbox (the 0.42 × 0.41 × 0.45 used by
  // the Kenney `loungeSofa` GLB at scale=1).
  const legacy = {
    packId: 'kenney-furniture-kit',
    installedAt: '2026-04-30T00:00:00Z',
    entries: [
      {
        id: 'kenney-furniture-kit:loungeSofa',
        packId: 'kenney-furniture-kit',
        entryId: 'loungeSofa',
        name: 'Lounge Sofa',
        category: 'seating',
        // Note: no `scale` field — that's the migration trigger.
        footprint: { w: 0.5, d: 0.5, h: 0.5 },
        glbKey: 'pack:kenney-furniture-kit:loungeSofa:glb',
        thumbKey: 'pack:kenney-furniture-kit:loungeSofa:thumb',
      },
    ],
  } as unknown as InstalledPack;

  await InstalledPackStore.put(legacy);
  await IdbAssetStore.put({
    assetId: 'pack:kenney-furniture-kit:loungeSofa:glb',
    kind: 'gltf',
    mime: 'model/gltf-binary',
    name: 'Lounge Sofa',
    uploadedAt: '2026-04-30T00:00:00Z',
    blob: new Blob([new Uint8Array(duckBytes)], { type: 'model/gltf-binary' }),
  });
}

describe('hydratePacks (migration)', () => {
  beforeEach(async () => {
    for (const p of await InstalledPackStore.list()) await InstalledPackStore.delete(p.packId);
    for (const a of await IdbAssetStore.list()) await IdbAssetStore.delete(a.assetId);
    useStore.getState().setPackFurniture([]);
    // happy-dom's URL.createObjectURL requires a real Blob instance, but
    // fake-indexeddb returns a plain object after the structured-clone
    // roundtrip. Stub for this test — the resulting URL value is not
    // exercised by the assertions.
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:test' });
  });

  it('backfills scale + rescales footprint for legacy installs and re-persists', async () => {
    await seedLegacyInstall();
    await hydratePacks();

    const def = useStore.getState().packFurniture.find((d) => d.entryId === 'loungeSofa');
    expect(def).toBeDefined();
    expect(def?.scale).toBe(2);

    const persisted = await InstalledPackStore.get('kenney-furniture-kit');
    const entry = persisted?.entries[0];
    expect(entry?.scale).toBe(2);
    // The persisted footprint should now reflect the scaled GLB bbox,
    // not the original 0.5/0.5/0.5 stub.
    expect(entry?.footprint.w).not.toBeCloseTo(0.5, 5);
    expect(entry?.footprint.w).toBeGreaterThan(0.5);
  });

  it('exposes def.defaultFootprint as the RAW bbox (entry.footprint / scale)', async () => {
    // Regression: hydratePacks used to copy the scaled `entry.footprint`
    // straight into `def.defaultFootprint`, which combined with
    // `def.scale` caused itemFootprint to multiply by scale a second
    // time (e.g. Kenney bench appearing 10.75 × 2.93 m).
    await seedLegacyInstall();
    await hydratePacks();

    const def = useStore.getState().packFurniture.find((d) => d.entryId === 'loungeSofa');
    const persisted = await InstalledPackStore.get('kenney-furniture-kit');
    const entry = persisted?.entries[0];
    expect(def && entry).toBeTruthy();
    if (!def || !entry) return;

    // entry.footprint is scaled (raw × scale), def.defaultFootprint is raw.
    expect(def.defaultFootprint.w).toBeCloseTo(entry.footprint.w / entry.scale, 5);
    expect(def.defaultFootprint.d).toBeCloseTo(entry.footprint.d / entry.scale, 5);
    expect(def.defaultFootprint.h).toBeCloseTo(entry.footprint.h / entry.scale, 5);
  });
});
