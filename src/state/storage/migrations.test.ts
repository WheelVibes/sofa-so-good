import { describe, it, expect } from 'vitest';
import { migrate, MIGRATIONS, VersionMismatchError } from './migrations';

describe('migrate', () => {
  it('passes through a v1 payload unchanged', () => {
    const payload = { version: 1, items: [] };
    expect(migrate(payload)).toBe(payload);
  });

  it('applies a registered v0→v1 migration if one exists', () => {
    MIGRATIONS[0] = (raw) => {
      const r = raw as Record<string, unknown>;
      return { ...r, version: 1, addedField: 'default' };
    };
    try {
      const out = migrate({ version: 0 }) as Record<string, unknown>;
      expect(out.version).toBe(1);
      expect(out.addedField).toBe('default');
    } finally {
      delete MIGRATIONS[0];
    }
  });

  it('throws VersionMismatchError on an unknown predecessor', () => {
    expect(() => migrate({ version: 0 })).toThrow(VersionMismatchError);
  });

  it('throws on a future version', () => {
    expect(() => migrate({ version: 99 })).toThrow(VersionMismatchError);
  });
});
