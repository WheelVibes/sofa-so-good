import { describe, it, expect } from 'vitest';
import {
  BUILTIN_MATERIALS,
  BUILTIN_MATERIALS_BY_CATEGORY,
  DEFAULT_FLOOR,
  DEFAULT_WALL,
} from './builtinCatalog';

describe('BUILTIN_MATERIALS', () => {
  it('every entry id matches its key', () => {
    for (const [k, v] of Object.entries(BUILTIN_MATERIALS)) {
      expect(v.id).toBe(k);
    }
  });

  it('every textured floor entry has a parseable source URL', () => {
    for (const m of Object.values(BUILTIN_MATERIALS)) {
      if (m.kind !== 'textured') continue;
      expect(() => new URL(m.sourceUrl ?? '')).not.toThrow();
      expect(m.uvScale[0]).toBeGreaterThan(0);
      expect(m.uvScale[1]).toBeGreaterThan(0);
    }
  });

  it('every entry has a valid 6- or 7-char hex swatch', () => {
    for (const m of Object.values(BUILTIN_MATERIALS)) {
      expect(m.swatch).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('default ids exist in the catalog', () => {
    expect(BUILTIN_MATERIALS[DEFAULT_FLOOR]).toBeDefined();
    expect(BUILTIN_MATERIALS[DEFAULT_WALL]).toBeDefined();
  });

  it('groups every entry exactly once', () => {
    const flat = Object.values(BUILTIN_MATERIALS_BY_CATEGORY).flat();
    const ids = new Set(flat.map((m) => m.id));
    expect(ids.size).toBe(Object.keys(BUILTIN_MATERIALS).length);
  });
});
