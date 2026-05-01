import { describe, it, expect } from 'vitest';
import { hourToPreset } from './hourToPreset';

describe('hourToPreset', () => {
  it('maps mid-day hours to "day"', () => {
    expect(hourToPreset(6)).toBe('day');
    expect(hourToPreset(12)).toBe('day');
    expect(hourToPreset(16.99)).toBe('day');
  });

  it('maps the late-afternoon window to "dusk"', () => {
    expect(hourToPreset(17)).toBe('dusk');
    expect(hourToPreset(18)).toBe('dusk');
    expect(hourToPreset(18.99)).toBe('dusk');
  });

  it('maps night hours to "night"', () => {
    expect(hourToPreset(0)).toBe('night');
    expect(hourToPreset(3)).toBe('night');
    expect(hourToPreset(19)).toBe('night');
    expect(hourToPreset(23.5)).toBe('night');
  });

  it('treats hours just below 6 as night and 6 as day', () => {
    expect(hourToPreset(5.99)).toBe('night');
    expect(hourToPreset(6)).toBe('day');
  });
});
