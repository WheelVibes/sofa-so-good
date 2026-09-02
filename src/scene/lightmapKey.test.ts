import { describe, expect, it } from 'vitest'
import fixture from './__fixtures__/lightmapKey.blender.json'
import { fnv1a32, lightmapKey } from './lightmapKey'

/**
 * A baked lightmap is useless if the runtime cannot find it. These tests pin the key that makes
 * that lookup possible, against a fixture emitted by the Blender-side twin
 * (`bake_material.py:geometry_key`). Two languages agreeing on a hash is not something to
 * assume — a single differing rounding rule or a different vertex order produces two keys for
 * one wall, and the failure mode is a map that silently never loads.
 */

interface Fixture {
  meshes: { object: string; area: number; key: string; world: number[][] }[]
  fnv1a32: Record<string, string>
}
const fx = fixture as Fixture

const flat = (world: number[][]) => {
  const out = new Float64Array(world.length * 3)
  world.forEach((v, i) => {
    out.set(v, i * 3)
  })
  return out
}

describe('fnv1a32', () => {
  it('matches the published FNV-1a 32-bit test vectors', () => {
    // Independent of the fixture on purpose: if both implementations were wrong in the same
    // way they would still agree with each other, and only a published vector catches that.
    expect(fnv1a32('')).toBe('811c9dc5') // the offset basis
    expect(fnv1a32('a')).toBe('e40c292c')
    expect(fnv1a32('abc')).toBe('1a47e90b')
  })

  it('agrees with the Blender-side implementation on the same strings', () => {
    for (const [text, expected] of Object.entries(fx.fnv1a32)) {
      expect(fnv1a32(text === 'empty' ? '' : text === 'sofa' ? 'sofa-so-good' : text)).toBe(
        expected,
      )
    }
  })
})

describe('lightmapKey', () => {
  it('reproduces every key Blender computed for real shell meshes', () => {
    expect(fx.meshes.length).toBeGreaterThanOrEqual(4)
    for (const mesh of fx.meshes) {
      expect(lightmapKey(flat(mesh.world))).toBe(mesh.key)
    }
  })

  it('gives four different walls four different keys', () => {
    // A key that collided would make one wall load another's visibility map — worse than no
    // map at all, and invisible without this check.
    const keys = new Set(fx.meshes.map((m) => lightmapKey(flat(m.world))))
    expect(keys.size).toBe(fx.meshes.length)
  })

  it('is independent of vertex order', () => {
    const mesh = fx.meshes[0]
    const shuffled = [...mesh.world].reverse()
    expect(lightmapKey(flat(shuffled))).toBe(mesh.key)
  })

  it('distinguishes identical geometry at different world positions', () => {
    // The whole point of hashing world space: two identical wall boxes in different rooms have
    // entirely different aperture visibility, so they must not share a map.
    const mesh = fx.meshes[0]
    const moved = mesh.world.map(([x, y, z]) => [x + 3, y, z])
    expect(lightmapKey(flat(moved))).not.toBe(mesh.key)
  })

  it('is stable against sub-millimetre float noise', () => {
    // Blender and the browser will not agree bit for bit on a transformed coordinate. The
    // millimetre quantum exists so they still agree on the key.
    const mesh = fx.meshes[0]
    const jittered = mesh.world.map(([x, y, z], i) => [
      x + (i % 2 === 0 ? 1e-7 : -1e-7),
      y + 1e-7,
      z - 1e-7,
    ])
    expect(lightmapKey(flat(jittered))).toBe(mesh.key)
  })
})
