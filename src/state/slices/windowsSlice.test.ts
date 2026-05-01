import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';

describe('windowsSlice', () => {
  beforeEach(() => useStore.getState().__resetForTest());

  it('has expected defaults', () => {
    const s = useStore.getState();
    expect(s.windowTint).toBe('none');
    expect(s.curtainsClosed).toBe(false);
    expect(s.curtainOpacity).toBeCloseTo(0.85, 5);
  });

  it('setWindowTint updates the preset', () => {
    useStore.getState().setWindowTint('warm');
    expect(useStore.getState().windowTint).toBe('warm');
  });

  it('setCurtainsClosed toggles the flag', () => {
    useStore.getState().setCurtainsClosed(true);
    expect(useStore.getState().curtainsClosed).toBe(true);
  });

  it('setCurtainOpacity clamps to [0.5, 1.0]', () => {
    useStore.getState().setCurtainOpacity(0.1);
    expect(useStore.getState().curtainOpacity).toBe(0.5);
    useStore.getState().setCurtainOpacity(2);
    expect(useStore.getState().curtainOpacity).toBe(1);
    useStore.getState().setCurtainOpacity(0.7);
    expect(useStore.getState().curtainOpacity).toBeCloseTo(0.7, 5);
  });
});
