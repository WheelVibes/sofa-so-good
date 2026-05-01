import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from './store';
import type { FurnitureItem } from '../furniture/types';

const sampleItem = (defId: string): Omit<FurnitureItem, 'id'> => ({
  defId,
  position: [1, 1],
  rotation: 0,
  props: {},
});

describe('store — Phase 1 slice', () => {
  beforeEach(() => useStore.getState().__resetForTest());

  it('starts in orbit camera mode in system time mode with measurements off', () => {
    const s = useStore.getState();
    expect(s.cameraMode).toBe('orbit');
    expect(s.timeMode).toBe('system');
    expect(s.manualHour).toBe(12);
    expect(s.showMeasurements).toBe(false);
  });

  it('switches camera mode', () => {
    useStore.getState().setCameraMode('firstPerson');
    expect(useStore.getState().cameraMode).toBe('firstPerson');
  });

  it('sets a manual hour via setPresetTime', () => {
    useStore.getState().setPresetTime('dusk');
    expect(useStore.getState().timeMode).toBe('manual');
    expect(useStore.getState().manualHour).toBe(18);
  });

  it('toggles measurements', () => {
    useStore.getState().toggleMeasurements();
    expect(useStore.getState().showMeasurements).toBe(true);
    useStore.getState().toggleMeasurements();
    expect(useStore.getState().showMeasurements).toBe(false);
  });

  it('toggles a door', () => {
    useStore.getState().toggleDoor('door-main');
    expect(useStore.getState().doors['door-main']?.open).toBe(true);
    useStore.getState().toggleDoor('door-main');
    expect(useStore.getState().doors['door-main']?.open).toBe(false);
  });

  it('opens a door explicitly without toggling', () => {
    useStore.getState().setDoorOpen('door-main', true);
    expect(useStore.getState().doors['door-main']?.open).toBe(true);
    useStore.getState().setDoorOpen('door-main', true);
    expect(useStore.getState().doors['door-main']?.open).toBe(true);
  });

  it('starts with no location and the prompt undismissed', () => {
    const s = useStore.getState();
    expect(s.location).toBeNull();
    expect(s.locationPromptDismissed).toBe(false);
  });
});

describe('store — items + selection slice', () => {
  beforeEach(() => useStore.getState().__resetForTest());

  it('starts with no items and nothing selected', () => {
    const s = useStore.getState();
    expect(s.items).toEqual([]);
    expect(s.selectedItemId).toBeNull();
    expect(s.selectedRoomId).toBeNull();
  });

  it('addItem assigns a unique id and selects the new item', () => {
    const a = useStore.getState().addItem(sampleItem('bed-double'));
    const b = useStore.getState().addItem(sampleItem('sofa-3seat'));
    expect(a).not.toBe(b);
    const s = useStore.getState();
    expect(s.items).toHaveLength(2);
    expect(s.selectedItemId).toBe(b);
  });

  it('moveItem and rotateItem update only the targeted item', () => {
    const a = useStore.getState().addItem(sampleItem('bed-double'));
    const b = useStore.getState().addItem(sampleItem('sofa-3seat'));
    useStore.getState().moveItem(a, [3, 4]);
    useStore.getState().rotateItem(b, Math.PI / 2);
    const s = useStore.getState();
    expect(s.items.find((i) => i.id === a)?.position).toEqual([3, 4]);
    expect(s.items.find((i) => i.id === a)?.rotation).toBe(0);
    expect(s.items.find((i) => i.id === b)?.rotation).toBeCloseTo(Math.PI / 2);
  });

  it('updateItemProps merges into the existing props bag', () => {
    const id = useStore.getState().addItem({
      ...sampleItem('bed-double'),
      props: { width: 1.4, mattressColor: '#fff' },
    });
    useStore.getState().updateItemProps(id, { width: 1.6 });
    const item = useStore.getState().items.find((i) => i.id === id)!;
    expect(item.props.width).toBe(1.6);
    expect(item.props.mattressColor).toBe('#fff');
  });

  it('setLightOverride patches the override map for an item', () => {
    const id = useStore.getState().addItem({
      defId: 'lamp-floor', position: [1, 1], rotation: 0, props: {},
    });
    useStore.getState().setLightOverride(id, { on: false });
    expect(useStore.getState().items[0].lightOverride).toEqual({ on: false });
    useStore.getState().setLightOverride(id, { intensity: 0.5 });
    expect(useStore.getState().items[0].lightOverride).toEqual({ on: false, intensity: 0.5 });
  });

  it('deleteItem removes the item and clears selection if it was selected', () => {
    const id = useStore.getState().addItem(sampleItem('bed-double'));
    expect(useStore.getState().selectedItemId).toBe(id);
    useStore.getState().deleteItem(id);
    expect(useStore.getState().items).toHaveLength(0);
    expect(useStore.getState().selectedItemId).toBeNull();
  });

  it('selecting an item clears any room selection (and vice versa)', () => {
    const id = useStore.getState().addItem(sampleItem('bed-double'));
    useStore.getState().selectRoom('mainBedroom');
    expect(useStore.getState().selectedItemId).toBeNull();
    useStore.getState().selectItem(id);
    expect(useStore.getState().selectedRoomId).toBeNull();
    expect(useStore.getState().selectedItemId).toBe(id);
  });
});

describe('store — reset actions', () => {
  beforeEach(() => useStore.getState().__resetForTest());

  it('resetToEmpty clears items and selection', () => {
    useStore.getState().addItem(sampleItem('bed-double'));
    useStore.getState().resetToEmpty();
    expect(useStore.getState().items).toEqual([]);
    expect(useStore.getState().selectedItemId).toBeNull();
  });

  it('resetToDefault populates the layout (idempotent ids)', () => {
    useStore.getState().resetToDefault();
    const first = useStore.getState().items.map((i) => i.id);
    expect(first.length).toBeGreaterThan(0);
    useStore.getState().resetToDefault();
    const second = useStore.getState().items.map((i) => i.id);
    expect(second).toEqual(first);
  });
});

describe('store — quality slice', () => {
  beforeEach(() => useStore.getState().__resetForTest());

  it('setQuality merges a partial patch', () => {
    useStore.getState().setQuality({ shadows: 'off' });
    expect(useStore.getState().quality.shadows).toBe('off');
    // other fields preserved (whatever pickDefaultQuality returned at init)
    expect(useStore.getState().quality.fixtures).toBe(true);
  });
});
