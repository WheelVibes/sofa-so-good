import { describe, it, expect } from 'vitest';
import { applySerialized, SerializedStateZ, serialize } from './schema';
import { useStore } from './store';
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog';

describe('schema', () => {
  it('serialize → parse round-trip preserves the persistent fields', () => {
    useStore.getState().__resetForTest();
    useStore.getState().resetToDefault();
    useStore.getState().setTimeOfDay('dusk');
    const out = serialize(useStore.getState());
    const round = SerializedStateZ.safeParse(out);
    expect(round.success).toBe(true);
    if (round.success) {
      expect(round.data.timeOfDay).toBe('dusk');
      expect(round.data.items.length).toBeGreaterThan(0);
    }
  });

  it('applySerialized drops items whose def is missing from the catalog', () => {
    useStore.getState().__resetForTest();
    useStore.getState().addItem({
      defId: 'unknown-def',
      position: [1, 1],
      rotation: 0,
      props: {},
    });
    useStore.getState().addItem({
      defId: 'bed-double',
      position: [2, 2],
      rotation: 0,
      props: {},
    });
    const saved = serialize(useStore.getState());
    const known = new Set(Object.keys(BUILTIN_CATALOG));
    const patch = applySerialized(saved, known);
    expect(patch.items?.every((it) => known.has(it.defId))).toBe(true);
    expect(patch.items?.length).toBe(1);
  });
});
