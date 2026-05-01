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
});
