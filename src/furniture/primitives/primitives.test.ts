import { describe, expect, it } from 'vitest'
import { BUILTIN_CATALOG } from '../builtinCatalog'
import { PRIMITIVE_COMPONENTS } from './index'

describe('primitives ↔ catalog wiring', () => {
  it('every PrimitiveKind referenced by the catalog has a component', () => {
    for (const def of Object.values(BUILTIN_CATALOG)) {
      if (def.kind !== 'parametric') continue
      expect(PRIMITIVE_COMPONENTS[def.primitive]).toBeTypeOf('function')
    }
  })

  it('PRIMITIVE_COMPONENTS exports exactly the kinds used in the catalog', () => {
    const used = new Set(
      Object.values(BUILTIN_CATALOG)
        .filter((d) => d.kind === 'parametric')
        .map((d) => (d.kind === 'parametric' ? d.primitive : '')),
    )
    for (const k of used) {
      expect(PRIMITIVE_COMPONENTS).toHaveProperty(k)
    }
  })
})
