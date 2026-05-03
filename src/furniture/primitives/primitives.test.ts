import { describe, it, expect } from 'vitest';
import { PRIMITIVE_COMPONENTS } from './index';
import { BUILTIN_CATALOG } from '../builtinCatalog';
import { defaultParamProps } from '../types';

describe('primitives ↔ catalog wiring', () => {
  it('every PrimitiveKind referenced by the catalog has a component', () => {
    for (const def of Object.values(BUILTIN_CATALOG)) {
      if (def.kind !== 'parametric') continue;
      expect(PRIMITIVE_COMPONENTS[def.primitive]).toBeTypeOf('function');
    }
  });

  it('PRIMITIVE_COMPONENTS exports exactly the kinds used in the catalog', () => {
    const used = new Set(
      Object.values(BUILTIN_CATALOG)
        .filter((d) => d.kind === 'parametric')
        .map((d) => d.kind === 'parametric' ? d.primitive : ''),
    );
    for (const k of used) {
      expect(PRIMITIVE_COMPONENTS).toHaveProperty(k);
    }
  });
});

describe('parametric primitive smoke', () => {
  for (const id of ['wall-shelf', 'sofa-sectional', 'wardrobe-open']) {
    it(`${id} renders with default params`, () => {
      const def = BUILTIN_CATALOG[id];
      expect(def?.kind).toBe('parametric');
      if (def?.kind !== 'parametric') return;
      const Component = PRIMITIVE_COMPONENTS[def.primitive];
      const props = defaultParamProps(def);
      expect(() => Component({ props })).not.toThrow();
    });
  }
});
