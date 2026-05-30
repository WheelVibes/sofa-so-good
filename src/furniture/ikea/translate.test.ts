import { describe, it, expect } from 'vitest';
import { mapCategory, placementFlags, titleCaseFinish } from './translate';

describe('mapCategory', () => {
  it('passes through known app categories', () => {
    expect(mapCategory('beds')).toEqual({ category: 'beds', confidence: 'high' });
    expect(mapCategory('lighting')).toEqual({ category: 'lighting', confidence: 'high' });
  });
  it('maps textiles and outdoor', () => {
    expect(mapCategory('textiles').category).toBe('textiles');
    expect(mapCategory('outdoor').category).toBe('outdoor');
  });
  it('falls back unknown to decor/low', () => {
    expect(mapCategory('spaceships')).toEqual({ category: 'decor', confidence: 'low' });
  });
});

describe('placementFlags', () => {
  it('floor placement → no flags', () => {
    expect(placementFlags({ placement: 'floor', semantics: { back_to_wall: true, front_clearance_m: 0 } }))
      .toEqual({});
  });
  it('wall placement → mounted', () => {
    expect(placementFlags({ placement: 'wall', semantics: {} }).mounted).toBe(true);
  });
  it('ceiling placement → mounted + lifted span', () => {
    const f = placementFlags({ placement: 'ceiling', semantics: {} }, { h: 0.3 });
    expect(f.mounted).toBe(true);
    expect(f.verticalSpan?.base).toBeGreaterThan(0);
  });
  it('no_clip → noClip', () => {
    expect(placementFlags({ placement: 'surface', semantics: { no_clip: true } }).noClip).toBe(true);
  });
  it('keeps positive front_clearance, omits zero', () => {
    expect(placementFlags({ placement: 'floor', semantics: { front_clearance_m: 0.6 } }).frontClearance).toBe(0.6);
    expect(placementFlags({ placement: 'floor', semantics: { front_clearance_m: 0 } }).frontClearance).toBeUndefined();
  });
});

describe('titleCaseFinish', () => {
  it('title-cases a hyphenated finish', () => {
    expect(titleCaseFinish('black-brown')).toBe('Black-brown');
    expect(titleCaseFinish('White stained oak veneer')).toBe('White stained oak veneer');
  });
});
