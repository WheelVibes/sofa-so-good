import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { FADE_MS, MIN_VISIBLE_MS, useOverlayLifecycle } from './useOverlayLifecycle';

describe('useOverlayLifecycle', () => {
  let now = 0;
  const clock = () => now;
  beforeEach(() => {
    now = 0;
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  function advance(ms: number) {
    now += ms;
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  }

  it('mounts immediately when active', () => {
    const { result } = renderHook(({ a }) => useOverlayLifecycle(a, clock), {
      initialProps: { a: true },
    });
    expect(result.current.mounted).toBe(true);
    expect(result.current.fading).toBe(false);
  });

  it('holds for the min-visible window, then fades, then unmounts', () => {
    const { result, rerender } = renderHook(({ a }) => useOverlayLifecycle(a, clock), {
      initialProps: { a: true },
    });
    // Deactivate almost immediately (well under MIN_VISIBLE_MS).
    advance(50);
    rerender({ a: false });
    // Still fully visible: min-time hold not elapsed.
    expect(result.current.mounted).toBe(true);
    expect(result.current.fading).toBe(false);

    // After the remaining hold, it starts fading but stays mounted.
    advance(MIN_VISIBLE_MS - 50);
    expect(result.current.fading).toBe(true);
    expect(result.current.mounted).toBe(true);

    // After the fade duration it unmounts.
    advance(FADE_MS);
    expect(result.current.mounted).toBe(false);
    expect(result.current.fading).toBe(false);
  });

  it('cancels a pending hide if reactivated mid-hold', () => {
    const { result, rerender } = renderHook(({ a }) => useOverlayLifecycle(a, clock), {
      initialProps: { a: true },
    });
    advance(10);
    rerender({ a: false });
    advance(100); // still within hold
    rerender({ a: true }); // reactivate
    advance(MIN_VISIBLE_MS + FADE_MS); // let any stale timers fire
    expect(result.current.mounted).toBe(true);
    expect(result.current.fading).toBe(false);
  });
});
