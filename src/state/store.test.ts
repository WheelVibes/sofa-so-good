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

  it('starts in orbit camera mode at day with measurements off', () => {
    const s = useStore.getState();
    expect(s.cameraMode).toBe('orbit');
    expect(s.timeOfDay).toBe('day');
    expect(s.showMeasurements).toBe(false);
  });

  it('switches camera mode', () => {
    useStore.getState().setCameraMode('firstPerson');
    expect(useStore.getState().cameraMode).toBe('firstPerson');
  });

  it('cycles time of day', () => {
    useStore.getState().setTimeOfDay('dusk');
    expect(useStore.getState().timeOfDay).toBe('dusk');
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
