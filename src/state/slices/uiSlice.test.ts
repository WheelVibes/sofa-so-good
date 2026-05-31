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

  it('picking a tier manually clears the adaptive shadow-shed fallback', () => {
    useStore.getState().setAutoShadowsOff(true);
    expect(useStore.getState().autoShadowsOff).toBe(true);
    useStore.getState().setQualityTier('low');
    expect(useStore.getState().autoShadowsOff).toBe(false);
  });
});

describe('uiSlice asset quality', () => {
  beforeEach(() => useStore.getState().__resetForTest());

  it('defaults to Auto (null — follows the render tier)', () => {
    expect(useStore.getState().assetTier).toBeNull();
  });

  it('setAssetTier sets and clears the explicit tier', () => {
    useStore.getState().setAssetTier('high');
    expect(useStore.getState().assetTier).toBe('high');
    useStore.getState().setAssetTier(null);
    expect(useStore.getState().assetTier).toBeNull();
  });

  it('an FPS auto-downgrade of the render tier leaves an explicit asset tier unchanged', () => {
    useStore.getState().setAssetTier('high');
    useStore.getState().autoSetQualityTier('low');
    expect(useStore.getState().assetTier).toBe('high');
  });
});
