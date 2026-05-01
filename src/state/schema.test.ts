import { describe, it, expect } from 'vitest';
import { applySerialized, SerializedStateZ, serialize } from './schema';
import { useStore } from './store';
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog';

describe('schema', () => {
  it('serialize → parse round-trip preserves the persistent fields', () => {
    useStore.getState().__resetForTest();
    useStore.getState().resetToDefault();
    useStore.getState().setPresetTime('dusk');
    const out = serialize(useStore.getState());
    const round = SerializedStateZ.safeParse(out);
    expect(round.success).toBe(true);
    if (round.success) {
      expect(round.data.timeMode).toBe('manual');
      expect(round.data.manualHour).toBe(18);
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

  it('round-trips timeMode + manualHour for system mode', () => {
    useStore.getState().__resetForTest();
    // default is system / 12
    const out = serialize(useStore.getState());
    const parsed = SerializedStateZ.safeParse(out);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.timeMode).toBe('system');
      expect(parsed.data.manualHour).toBe(12);
    }
  });

  it('round-trips timeMode + manualHour for manual mode', () => {
    useStore.getState().__resetForTest();
    useStore.getState().setManualHour(15.5);
    const out = serialize(useStore.getState());
    const parsed = SerializedStateZ.safeParse(out);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.timeMode).toBe('manual');
      expect(parsed.data.manualHour).toBe(15.5);
    }
  });

  it('migrates legacy timeOfDay="day" to manual hour 12', () => {
    const legacy = {
      version: 1,
      apartmentId: 'serangoon-north-vista-4r',
      items: [],
      doors: {},
      finishes: { floor: {}, walls: {} },
      userFurniture: [],
      userMaterials: [],
      timeOfDay: 'day',
      cameraMode: 'orbit',
      savedAt: '2026-04-01T00:00:00.000Z',
    };
    const parsed = SerializedStateZ.parse(legacy);
    expect(parsed.timeMode).toBe('manual');
    expect(parsed.manualHour).toBe(12);
  });

  it('migrates legacy timeOfDay="dusk" to manual hour 18', () => {
    const legacy = {
      version: 1,
      apartmentId: 'serangoon-north-vista-4r',
      items: [],
      doors: {},
      finishes: { floor: {}, walls: {} },
      userFurniture: [],
      userMaterials: [],
      timeOfDay: 'dusk',
      cameraMode: 'orbit',
      savedAt: '2026-04-01T00:00:00.000Z',
    };
    const parsed = SerializedStateZ.parse(legacy);
    expect(parsed.timeMode).toBe('manual');
    expect(parsed.manualHour).toBe(18);
  });

  it('migrates legacy timeOfDay="night" to manual hour 0', () => {
    const legacy = {
      version: 1,
      apartmentId: 'serangoon-north-vista-4r',
      items: [],
      doors: {},
      finishes: { floor: {}, walls: {} },
      userFurniture: [],
      userMaterials: [],
      timeOfDay: 'night',
      cameraMode: 'orbit',
      savedAt: '2026-04-01T00:00:00.000Z',
    };
    const parsed = SerializedStateZ.parse(legacy);
    expect(parsed.timeMode).toBe('manual');
    expect(parsed.manualHour).toBe(0);
  });

  it('applySerialized writes timeMode + manualHour back into the store patch', () => {
    useStore.getState().__resetForTest();
    useStore.getState().setManualHour(7.5);
    const out = serialize(useStore.getState());
    const patch = applySerialized(out, new Set());
    expect(patch.timeMode).toBe('manual');
    expect(patch.manualHour).toBe(7.5);
  });
});
