import { describe, it, expect, beforeEach } from 'vitest';
import { evictOldest, LocalStorageAdapter, AUTOSAVE_SLOT } from './LocalStorageAdapter';
import type { SerializedState } from '../schema';

function fakeState(savedAt: string): SerializedState {
  return {
    version: 2,
    apartmentId: 'serangoon-north-vista-4r',
    items: [],
    doors: {},
    finishes: { floor: {}, walls: {} },
    userFurniture: [],
    userMaterials: [],
    timeMode: 'system',
    manualHour: 12,
    cameraMode: 'orbit',
    location: null,
    locationPromptDismissed: false,
    savedAt,
  };
}

describe('evictOldest', () => {
  it('returns input unchanged when at or below the cap', () => {
    const entries = [
      { slot: 'a', savedAt: '2026-01-01' },
      { slot: 'b', savedAt: '2026-01-02' },
    ];
    expect(evictOldest(entries).evicted).toBe(null);
  });

  it('drops the oldest non-autosave slot when over the cap', () => {
    const entries = Array.from({ length: 11 }, (_, i) => ({
      slot: `slot-${i}`,
      savedAt: `2026-01-${String(i + 1).padStart(2, '0')}`,
    }));
    const { evicted } = evictOldest(entries);
    expect(evicted).toBe('slot-0');
  });

  it('never evicts the autosave slot', () => {
    const entries = [
      { slot: AUTOSAVE_SLOT, savedAt: '2026-01-01' },
      ...Array.from({ length: 11 }, (_, i) => ({
        slot: `slot-${i}`,
        savedAt: `2026-01-${String(i + 2).padStart(2, '0')}`,
      })),
    ];
    const { evicted } = evictOldest(entries);
    expect(evicted).toBe('slot-0');
  });
});

describe('LocalStorageAdapter', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('save / load round-trip a named slot', async () => {
    const s = fakeState('2026-04-26T10:00:00.000Z');
    await LocalStorageAdapter.save('demo-1', s);
    const loaded = await LocalStorageAdapter.load('demo-1');
    expect(loaded?.savedAt).toBe(s.savedAt);
  });

  it('list returns saved slots with their savedAt', async () => {
    await LocalStorageAdapter.save('a', fakeState('2026-04-26T10:00:00.000Z'));
    await LocalStorageAdapter.save('b', fakeState('2026-04-27T10:00:00.000Z'));
    const list = await LocalStorageAdapter.list();
    const slots = list.map((e) => e.slot).sort();
    expect(slots).toEqual(['a', 'b']);
  });

  it('does not list the autosave slot', async () => {
    await LocalStorageAdapter.save(AUTOSAVE_SLOT, fakeState('2026-04-26T10:00:00.000Z'));
    const list = await LocalStorageAdapter.list();
    expect(list.some((e) => e.slot === AUTOSAVE_SLOT)).toBe(false);
  });

  it('delete removes the slot and its index entry', async () => {
    await LocalStorageAdapter.save('demo-1', fakeState('2026-04-26T10:00:00.000Z'));
    await LocalStorageAdapter.delete('demo-1');
    const loaded = await LocalStorageAdapter.load('demo-1');
    expect(loaded).toBeNull();
    const list = await LocalStorageAdapter.list();
    expect(list).toEqual([]);
  });

  it('returns null when loading a missing slot', async () => {
    expect(await LocalStorageAdapter.load('does-not-exist')).toBeNull();
  });
});
