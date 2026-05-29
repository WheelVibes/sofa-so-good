import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';

describe('uiSlice lights mode', () => {
  beforeEach(() => useStore.getState().__resetForTest());

  it('defaults to auto', () => {
    expect(useStore.getState().lightsMode).toBe('auto');
  });

  it('setLightsMode sets the mode directly', () => {
    useStore.getState().setLightsMode('on');
    expect(useStore.getState().lightsMode).toBe('on');
    useStore.getState().setLightsMode('off');
    expect(useStore.getState().lightsMode).toBe('off');
  });

  it('cycleLightsMode cycles auto → on → off → auto', () => {
    const cycle = () => useStore.getState().cycleLightsMode();
    expect(useStore.getState().lightsMode).toBe('auto');
    cycle();
    expect(useStore.getState().lightsMode).toBe('on');
    cycle();
    expect(useStore.getState().lightsMode).toBe('off');
    cycle();
    expect(useStore.getState().lightsMode).toBe('auto');
  });
});
