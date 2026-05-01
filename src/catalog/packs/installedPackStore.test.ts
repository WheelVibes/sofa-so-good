import { describe, expect, it, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { InstalledPackStore } from './installedPackStore';
import type { InstalledPack } from './types';

const sample: InstalledPack = {
  packId: 'kenney-furniture-kit',
  installedAt: '2026-05-01T00:00:00Z',
  entries: [
    {
      id: 'kenney-furniture-kit:bedDouble',
      packId: 'kenney-furniture-kit',
      entryId: 'bedDouble',
      name: 'Bed Double',
      category: 'beds',
      footprint: { w: 1.5, d: 2, h: 0.8 },
      glbKey: 'pack:kenney-furniture-kit:bedDouble:glb',
      thumbKey: 'pack:kenney-furniture-kit:bedDouble:thumb',
    },
  ],
};

describe('InstalledPackStore', () => {
  beforeEach(async () => {
    for (const p of await InstalledPackStore.list()) await InstalledPackStore.delete(p.packId);
  });

  it('roundtrips a pack', async () => {
    await InstalledPackStore.put(sample);
    const got = await InstalledPackStore.get('kenney-furniture-kit');
    expect(got?.entries).toHaveLength(1);
    expect(got?.entries[0].name).toBe('Bed Double');
  });

  it('lists all installed packs', async () => {
    await InstalledPackStore.put(sample);
    const all = await InstalledPackStore.list();
    expect(all).toHaveLength(1);
    expect(all[0].packId).toBe('kenney-furniture-kit');
  });

  it('deletes a pack', async () => {
    await InstalledPackStore.put(sample);
    await InstalledPackStore.delete('kenney-furniture-kit');
    expect(await InstalledPackStore.get('kenney-furniture-kit')).toBeNull();
  });
});
