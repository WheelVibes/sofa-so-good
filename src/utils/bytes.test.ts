import { describe, it, expect } from 'vitest';
import { formatBytes } from './bytes';

describe('formatBytes', () => {
  it('formats sub-KB as bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('formats sub-MB as rounded KB', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(850 * 1024)).toBe('850 KB');
    expect(formatBytes(1024 * 1024 - 1)).toBe('1024 KB');
  });

  it('formats >=1 MB as one-decimal MB', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(1234567)).toBe('1.2 MB');
    expect(formatBytes(50 * 1024 * 1024)).toBe('50.0 MB');
  });

  it('returns empty string for invalid input', () => {
    expect(formatBytes(NaN)).toBe('');
    expect(formatBytes(-1)).toBe('');
  });
});
