import { describe, expect, it, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { zipSync } from 'fflate';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { installPack } from './install';
import { InstalledPackStore } from './installedPackStore';
import { IdbAssetStore } from '../../state/storage/IdbAssetStore';
import { AVAILABLE_PACKS } from './registry';

function makeMockPackZip(): Uint8Array {
  const duck = readFileSync(
    resolve(__dirname, '../../../scripts/asset-pipeline/__tests__/fixtures/duck.glb'),
  );
  return zipSync({
    'Models/GLTF format/bedDouble.glb': new Uint8Array(duck),
    'Models/GLTF format/loungeSofa.glb': new Uint8Array(duck),
    'Isometric/ignore.png': new Uint8Array([1, 2, 3]),
  });
}

describe('installPack', () => {
  beforeEach(async () => {
    for (const p of await InstalledPackStore.list()) await InstalledPackStore.delete(p.packId);
    for (const a of await IdbAssetStore.list()) await IdbAssetStore.delete(a.assetId);
  });

  it('fetches, unzips, renders thumbs, writes blobs + manifest', async () => {
    const zipBytes = makeMockPackZip();
    const fakeFetch = vi.fn(
      async () =>
        new Response(new Blob([zipBytes.buffer.slice(0) as ArrayBuffer]), {
          status: 200,
          headers: {
            'Content-Length': String(zipBytes.byteLength),
            'Content-Type': 'application/zip',
          },
        }),
    );

    const realPack = AVAILABLE_PACKS[0];
    // Override sizeBytes for the small mock zip so HEAD-validation passes.
    const pack = { ...realPack, sizeBytes: zipBytes.byteLength };

    const installed = await installPack(pack, { fetchImpl: fakeFetch as unknown as typeof fetch });

    expect(fakeFetch).toHaveBeenCalledWith(pack.downloadUrl, expect.anything());
    expect(installed.packId).toBe(pack.id);
    expect(installed.entries.map((e) => e.entryId).sort()).toEqual(['bedDouble', 'loungeSofa']);
    const got = await InstalledPackStore.get(pack.id);
    expect(got?.entries).toHaveLength(2);
    for (const entry of installed.entries) {
      expect(await IdbAssetStore.get(entry.glbKey)).not.toBeNull();
      expect(await IdbAssetStore.get(entry.thumbKey)).not.toBeNull();
    }
  });

  it('applies the curated per-id scale to each entry footprint', async () => {
    const zipBytes = makeMockPackZip();
    const fakeFetch = vi.fn(
      async () =>
        new Response(new Blob([zipBytes.buffer.slice(0) as ArrayBuffer]), {
          status: 200,
          headers: {
            'Content-Length': String(zipBytes.byteLength),
            'Content-Type': 'application/zip',
          },
        }),
    );
    const realPack = AVAILABLE_PACKS[0];
    const pack = { ...realPack, sizeBytes: zipBytes.byteLength };

    const installed = await installPack(pack, { fetchImpl: fakeFetch as unknown as typeof fetch });

    // bedDouble is intentionally scale=1 (already correct in source).
    const bed = installed.entries.find((e) => e.entryId === 'bedDouble');
    expect(bed?.scale).toBe(1);
    // loungeSofa is curated to scale=2 to bring the half-sized model up to
    // a real-world ~2 m sofa width.
    const sofa = installed.entries.find((e) => e.entryId === 'loungeSofa');
    expect(sofa?.scale).toBe(2);
    // Footprint reflects the applied scale (sofa footprint = 2× bed footprint
    // here because the test fixture re-uses one duck.glb for both).
    if (bed && sofa) {
      expect(sofa.footprint.w).toBeCloseTo(bed.footprint.w * 2, 5);
      expect(sofa.footprint.d).toBeCloseTo(bed.footprint.d * 2, 5);
      expect(sofa.footprint.h).toBeCloseTo(bed.footprint.h * 2, 5);
    }
  });

  it('stores the RAW (unscaled) bbox on def.defaultFootprint so itemFootprint × scale stays single-applied', async () => {
    // Regression: when defaultFootprint was set to the scaled bbox, the
    // collision/selection-outline path multiplied by scale a second time,
    // producing a scale² footprint (e.g. Kenney bench at 10.75 × 2.93 m).
    const zipBytes = makeMockPackZip();
    const fakeFetch = vi.fn(
      async () =>
        new Response(new Blob([zipBytes.buffer.slice(0) as ArrayBuffer]), {
          status: 200,
          headers: {
            'Content-Length': String(zipBytes.byteLength),
            'Content-Type': 'application/zip',
          },
        }),
    );
    const { useStore } = await import('../../state/store');
    const realPack = AVAILABLE_PACKS[0];
    const pack = { ...realPack, sizeBytes: zipBytes.byteLength };

    await installPack(pack, { fetchImpl: fakeFetch as unknown as typeof fetch });

    const defs = useStore.getState().packFurniture;
    const sofaDef = defs.find((d) => d.entryId === 'loungeSofa');
    const bedDef = defs.find((d) => d.entryId === 'bedDouble');
    expect(sofaDef).toBeDefined();
    expect(bedDef).toBeDefined();
    if (!sofaDef || !bedDef) return;

    // Both defs share the same source GLB in this fixture; raw bbox is
    // identical regardless of curated scale.
    expect(sofaDef.defaultFootprint.w).toBeCloseTo(bedDef.defaultFootprint.w, 5);
    expect(sofaDef.defaultFootprint.d).toBeCloseTo(bedDef.defaultFootprint.d, 5);
    expect(sofaDef.scale).toBe(2);
    // sofa as-placed = raw × scale matches the persisted scaled entry.footprint.
    const sofaEntry = (await InstalledPackStore.get(pack.id))?.entries.find(
      (e) => e.entryId === 'loungeSofa',
    );
    expect(sofaEntry?.footprint.w).toBeCloseTo(sofaDef.defaultFootprint.w * 2, 5);
  });
});
