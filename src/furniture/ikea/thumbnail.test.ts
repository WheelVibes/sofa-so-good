import { describe, it, expect } from 'vitest';
import { fitDimensions } from './thumbnail';

describe('fitDimensions', () => {
  it('scales the longest edge down to maxEdge, preserving aspect', () => {
    expect(fitDimensions(1000, 500, 256)).toEqual({ w: 256, h: 128 });
    expect(fitDimensions(400, 800, 256)).toEqual({ w: 128, h: 256 });
  });
  it('never upscales a small image', () => {
    expect(fitDimensions(100, 80, 256)).toEqual({ w: 100, h: 80 });
  });
  it('handles a square image', () => {
    expect(fitDimensions(512, 512, 256)).toEqual({ w: 256, h: 256 });
  });
});
