import { describe, expect, it } from 'vitest';
import { packEntryScale, scaledFootprint } from './scaleHeuristic';

describe('packEntryScale', () => {
  it('returns 1 for unknown packs', () => {
    expect(packEntryScale('not-a-pack', 'loungeSofa')).toBe(1);
  });

  it('returns 1 for kit entries that are already real-world sized', () => {
    // Beds and the cross dining table measure close to real life as-is —
    // the curated table either omits them or pins scale=1 explicitly.
    expect(packEntryScale('kenney-furniture-kit', 'bedDouble')).toBe(1);
    expect(packEntryScale('kenney-furniture-kit', 'tableCross')).toBe(1);
  });

  it('scales up the half-sized seating, storage, kitchen, and lighting items', () => {
    expect(packEntryScale('kenney-furniture-kit', 'loungeSofa')).toBeGreaterThan(1.5);
    expect(packEntryScale('kenney-furniture-kit', 'bookcaseClosed')).toBeGreaterThan(1.5);
    expect(packEntryScale('kenney-furniture-kit', 'kitchenFridge')).toBeGreaterThan(1.5);
    expect(packEntryScale('kenney-furniture-kit', 'lampRoundFloor')).toBeGreaterThan(1.5);
  });

  it('returns 1 for unknown ids inside a known pack', () => {
    expect(packEntryScale('kenney-furniture-kit', 'somethingNotInTable')).toBe(1);
  });
});

describe('scaledFootprint', () => {
  it('multiplies each axis by the scale', () => {
    expect(scaledFootprint({ w: 1, d: 2, h: 3 }, 1.5)).toEqual({ w: 1.5, d: 3, h: 4.5 });
  });

  it('is a no-op at scale=1', () => {
    expect(scaledFootprint({ w: 1.62, d: 1.91, h: 0.51 }, 1)).toEqual({
      w: 1.62,
      d: 1.91,
      h: 0.51,
    });
  });
});
