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

  it('round-trips imported-GLB metadata on user furniture defs', () => {
    useStore.getState().__resetForTest();
    useStore.getState().setUserFurniture([
      {
        id: 'user-abc',
        name: 'Wall Sconce',
        category: 'decor',
        kind: 'gltf',
        source: 'user',
        assetId: 'abc',
        uploadedAt: '2026-04-01T00:00:00.000Z',
        defaultFootprint: { w: 0.5, d: 0.3, h: 0.4 },
        mounted: true,
        noClip: true,
        verticalSpan: { base: 1.5, top: 2.1 },
        finishTargets: [{ key: 'shade', label: 'Shade' }],
        finishOverrides: { shade: 'mat:brass-01' },
      },
    ]);
    const out = serialize(useStore.getState());
    const parsed = SerializedStateZ.safeParse(out);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const def = parsed.data.userFurniture.find((d) => d.id === 'user-abc');
      expect(def).toBeDefined();
      expect(def?.mounted).toBe(true);
      expect(def?.noClip).toBe(true);
      expect(def?.verticalSpan).toEqual({ base: 1.5, top: 2.1 });
      expect(def?.finishTargets).toEqual([{ key: 'shade', label: 'Shade' }]);
      expect(def?.finishOverrides).toEqual({ shade: 'mat:brass-01' });
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

  it('omits the floor plan for the default flat, round-trips a custom one', () => {
    useStore.getState().__resetForTest();
    // Default flat → no floorPlan in the payload (rebuilt from constants).
    expect(serialize(useStore.getState()).floorPlan).toBeUndefined();
    // A custom plan is persisted and restored.
    useStore.getState().newFloorPlan('Saved Studio');
    const customId = useStore.getState().floorPlan.id;
    const out = serialize(useStore.getState());
    expect(out.floorPlan?.name).toBe('Saved Studio');
    const parsed = SerializedStateZ.safeParse(out);
    expect(parsed.success).toBe(true);
    const patch = applySerialized(out, new Set());
    expect(patch.floorPlan?.id).toBe(customId);
    // Applying a default-flat payload restores the default plan.
    useStore.getState().__resetForTest();
    const defPatch = applySerialized(serialize(useStore.getState()), new Set());
    expect(defPatch.floorPlan?.id).toBe('default-hdb-4room');
  });

  it('round-trips a location with a label', () => {
    useStore.getState().__resetForTest();
    useStore.getState().setLocation({ lat: 51.5, lon: 0, label: 'London, UK' });
    const out = serialize(useStore.getState());
    const parsed = SerializedStateZ.safeParse(out);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.location).toEqual({ lat: 51.5, lon: 0, label: 'London, UK' });
      expect(parsed.data.locationPromptDismissed).toBe(false);
    }
  });

  it('defaults missing location fields when reading legacy payloads', () => {
    const legacy = {
      version: 1,
      apartmentId: 'serangoon-north-vista-4r',
      items: [],
      doors: {},
      finishes: { floor: {}, walls: {} },
      userFurniture: [],
      userMaterials: [],
      timeMode: 'system',
      manualHour: 12,
      cameraMode: 'orbit',
      savedAt: '2026-04-01T00:00:00.000Z',
    };
    const parsed = SerializedStateZ.parse(legacy);
    expect(parsed.location).toBeNull();
    expect(parsed.locationPromptDismissed).toBe(false);
  });

  it('applySerialized restores location into the store patch', () => {
    useStore.getState().__resetForTest();
    useStore.getState().setLocation({ lat: 35.68, lon: 139.69, label: 'Tokyo' });
    useStore.getState().dismissLocationPrompt();
    const out = serialize(useStore.getState());
    const patch = applySerialized(out, new Set());
    expect(patch.location).toEqual({ lat: 35.68, lon: 139.69, label: 'Tokyo' });
    expect(patch.locationPromptDismissed).toBe(true);
  });
});
