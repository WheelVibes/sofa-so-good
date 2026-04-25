import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from './store';

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
