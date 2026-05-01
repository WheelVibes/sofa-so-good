import { describe, it, expect } from 'vitest';
import { pickDefaultQuality, QUALITY_PRESETS } from './qualitySlice';

function withNav(hwc: number | undefined, mem: number | undefined, fn: () => void) {
  const orig = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', {
    value: { hardwareConcurrency: hwc, deviceMemory: mem },
    configurable: true,
    writable: true,
  });
  try { fn(); } finally {
    Object.defineProperty(globalThis, 'navigator', { value: orig, configurable: true, writable: true });
  }
}

describe('pickDefaultQuality', () => {
  it('returns low on a 2-core / 2 GB device', () => {
    withNav(2, 2, () => {
      expect(pickDefaultQuality()).toEqual(QUALITY_PRESETS.low);
    });
  });
  it('returns high on an 8-core / 8 GB device', () => {
    withNav(8, 8, () => {
      expect(pickDefaultQuality()).toEqual(QUALITY_PRESETS.high);
    });
  });
  it('returns medium when hints are missing', () => {
    withNav(undefined, undefined, () => {
      expect(pickDefaultQuality()).toEqual(QUALITY_PRESETS.medium);
    });
  });
  it('returns medium for a mid-tier 4-core / 4 GB device', () => {
    withNav(4, 4, () => {
      expect(pickDefaultQuality()).toEqual(QUALITY_PRESETS.medium);
    });
  });
});
