import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';
import { loadQualityPrefs } from './qualityPrefs';

describe('qualityPrefs persistence', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest();
    localStorage.clear();
  });

  it('loads a persisted explicit asset tier and migrates legacy "low" render tier → "performance"', () => {
    localStorage.setItem(
      'sofa.graphics.v1',
      JSON.stringify({ tier: 'low', overrides: {}, userSet: true, assetTier: 'high' }),
    );
    loadQualityPrefs();
    expect(useStore.getState().assetTier).toBe('high');
    // Legacy 'low' render tier → 'performance' (the new flat tier).
    expect(useStore.getState().qualityTier).toBe('performance');
  });

  it('preserves a persisted "maximum" render tier as-is', () => {
    localStorage.setItem(
      'sofa.graphics.v1',
      JSON.stringify({ tier: 'maximum', overrides: {}, userSet: true }),
    );
    loadQualityPrefs();
    expect(useStore.getState().qualityTier).toBe('maximum');
  });

  it('defaults asset tier to Auto (null) when absent from saved prefs', () => {
    localStorage.setItem(
      'sofa.graphics.v1',
      JSON.stringify({ tier: 'medium', overrides: {}, userSet: false }),
    );
    loadQualityPrefs();
    expect(useStore.getState().assetTier).toBeNull();
  });
});
