import { describe, expect, it } from 'vitest'
import { BUILTIN_BY_CATEGORY, BUILTIN_CATALOG } from './builtinCatalog'
import { defaultParamProps, type ParametricDef } from './types'

describe('BUILTIN_CATALOG', () => {
  it('every entry id matches its key', () => {
    for (const [key, def] of Object.entries(BUILTIN_CATALOG)) {
      expect(def.id).toBe(key)
    }
  })

  it('every parametric entry has at least one param field with a valid default', () => {
    for (const def of Object.values(BUILTIN_CATALOG)) {
      if (def.kind !== 'parametric') continue
      expect(def.paramSchema.length).toBeGreaterThan(0)
      const props = defaultParamProps(def)
      for (const f of def.paramSchema) {
        expect(props[f.key]).toBeDefined()
        if (f.kind === 'number') {
          const v = props[f.key] as number
          expect(v).toBeGreaterThanOrEqual(f.min)
          expect(v).toBeLessThanOrEqual(f.max)
        }
        if (f.kind === 'integer') {
          const v = props[f.key] as number
          expect(Number.isInteger(v)).toBe(true)
          expect(v).toBeGreaterThanOrEqual(f.min)
          expect(v).toBeLessThanOrEqual(f.max)
        }
        if (f.kind === 'enum') {
          // `mat:<id>` defaults are valid catalog/DLC material references resolved
          // at runtime (useSurfaceMaterialOptions) — they don't need to appear in
          // the static `options` list, which only holds the procedural presets.
          const isMatDefault =
            typeof f.default === 'string' && (f.default as string).startsWith('mat:')
          if (!isMatDefault) {
            expect(f.options.some((o) => o.value === f.default)).toBe(true)
          }
        }
      }
    }
  })

  it('every parametric def references a primitive component', () => {
    for (const def of Object.values(BUILTIN_CATALOG)) {
      if (def.kind === 'parametric') {
        expect((def as ParametricDef).primitive).toMatch(/^[A-Z]/)
      }
    }
  })

  it('every built-in gltf def is CC0 with a source URL', () => {
    for (const def of Object.values(BUILTIN_CATALOG)) {
      if (def.kind !== 'gltf' || def.source !== 'builtin') continue
      expect(def.license).toBe('CC0')
      expect(() => new URL(def.sourceUrl ?? '')).not.toThrow()
      expect(def.url.startsWith('/assets/furniture/')).toBe(true)
    }
  })

  it('every entry has a non-zero default footprint', () => {
    for (const def of Object.values(BUILTIN_CATALOG)) {
      expect(def.defaultFootprint.w).toBeGreaterThan(0)
      expect(def.defaultFootprint.d).toBeGreaterThan(0)
      expect(def.defaultFootprint.h).toBeGreaterThan(0)
    }
  })

  it('BUILTIN_BY_CATEGORY contains every entry exactly once', () => {
    const flat = Object.values(BUILTIN_BY_CATEGORY).flat()
    const ids = new Set(flat.map((d) => d.id))
    expect(ids.size).toBe(flat.length)
    expect(ids.size).toBe(Object.keys(BUILTIN_CATALOG).length)
  })
})
