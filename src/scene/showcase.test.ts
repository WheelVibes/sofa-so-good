import { describe, it, expect } from 'vitest';
import { nextShowcaseState, IDLE_MS, type ShowcaseState } from './showcase';

const live: ShowcaseState = { mode: 'live', stillSince: null };

describe('nextShowcaseState', () => {
  it('stays live until the camera has been still for IDLE_MS', () => {
    const s1 = nextShowcaseState(live, { moved: false, now: 1000 });
    expect(s1.mode).toBe('live');
    expect(s1.stillSince).toBe(1000);
    const s2 = nextShowcaseState(s1, { moved: false, now: 1000 + IDLE_MS - 1 });
    expect(s2.mode).toBe('live');
  });

  it('enters accumulate once still past IDLE_MS', () => {
    const s1 = nextShowcaseState(live, { moved: false, now: 1000 });
    const s2 = nextShowcaseState(s1, { moved: false, now: 1000 + IDLE_MS + 1 });
    expect(s2.mode).toBe('accumulate');
  });

  it('resets to live the moment the camera moves', () => {
    const acc: ShowcaseState = { mode: 'accumulate', stillSince: 0 };
    const s = nextShowcaseState(acc, { moved: true, now: 5000 });
    expect(s.mode).toBe('live');
    expect(s.stillSince).toBeNull();
  });
});
