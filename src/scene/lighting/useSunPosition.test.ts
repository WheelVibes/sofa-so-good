import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSunPosition, FALLBACK_LOCATION } from './useSunPosition';
import { useStore } from '../../state/store';

describe('FALLBACK_LOCATION', () => {
  it('is Singapore', () => {
    expect(FALLBACK_LOCATION).toEqual({ lat: 1.35, lon: 103.82 });
  });
});

describe('useSunPosition', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T04:00:00.000Z')); // 12:00 SGT
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a SunPosition derived from the fallback when no user location', () => {
    const { result } = renderHook(() => useSunPosition());
    expect(typeof result.current.altitude).toBe('number');
    // Singapore at noon — sun should be high.
    expect(result.current.altitude).toBeGreaterThan(0.8); // > ~46°
  });

  it('uses the user location when set', () => {
    useStore.getState().setLocation({ lat: 51.5, lon: 0 });
    useStore.getState().setManualHour(12); // forces manual mode at noon
    const { result } = renderHook(() => useSunPosition());
    // London at "noon" on May 1: altitude < Singapore noon.
    expect(result.current.altitude).toBeLessThan(1.2); // < ~69°
  });

  it('updates when manualHour changes', () => {
    useStore.getState().setManualHour(0); // midnight
    const { result } = renderHook(() => useSunPosition());
    const midnight = result.current.altitude;
    act(() => useStore.getState().setManualHour(12));
    const noon = result.current.altitude;
    expect(midnight).toBeLessThan(0);
    expect(noon).toBeGreaterThan(0);
  });
});
