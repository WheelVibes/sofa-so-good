// @vitest-environment node
import { BufferAttribute, BufferGeometry, Mesh, MeshStandardMaterial, Object3D } from 'three'
import { describe, expect, it } from 'vitest'
import { applyLightmapsFromIndex } from './applyVisibilityLightmaps'
import { type LightmapIndex, parseLightmapIndex } from './lightmapIndex'
import { lightmapKey } from './lightmapKey'

/**
 * These run in the node environment against real three objects but no renderer: the shader patch
 * is a callback three would invoke at compile time, and nothing here compiles anything. The
 * texture loader is injected so no network or GPU is involved.
 */

/** A 2x3x0.3 m box at the origin — shell-sized, so a candidate. */
function wall(x = 0): Mesh {
  const g = new BufferGeometry()
  // Two triangles is enough: the filter reads the bounding box, and the key reads positions.
  const p = new Float32Array([x, 0, 0, x + 3, 0, 0, x + 3, 2, 0, x, 2, 0])
  g.setAttribute('position', new BufferAttribute(p, 3))
  g.setIndex([0, 1, 2, 0, 2, 3])
  return new Mesh(g, new MeshStandardMaterial())
}

/** A 10 cm knob — below the span filter, so it must never be keyed. */
function trinket(): Mesh {
  const g = new BufferGeometry()
  const p = new Float32Array([0, 0, 0, 0.1, 0, 0, 0.1, 0.1, 0])
  g.setAttribute('position', new BufferAttribute(p, 3))
  return new Mesh(g, new MeshStandardMaterial())
}

const CTX = 'ctxtest1'
const indexFor = (keys: string[]): LightmapIndex => {
  const r = parseLightmapIndex({
    version: 2,
    pass: 'visibility',
    uv: 'box-atlas-3x2',
    maps: keys.map((k) => ({ key: k, file: `${k}.png`, ctx: CTX })),
  })
  if (!('index' in r)) throw new Error('bad fixture')
  return r.index
}

const stubTexture = () => ({ channel: 0, generateMipmaps: true, minFilter: 0 }) as never

function keyOf(mesh: Mesh): string {
  mesh.updateMatrixWorld(true)
  const pos = mesh.geometry.getAttribute('position')
  const out = new Float64Array(pos.count * 3)
  for (let i = 0; i < pos.count; i += 1) {
    out[i * 3] = pos.getX(i)
    out[i * 3 + 1] = pos.getY(i)
    out[i * 3 + 2] = pos.getZ(i)
  }
  return lightmapKey(out)
}

describe('applyLightmapsFromIndex', () => {
  it('applies a map to a matching mesh and sets uv1', () => {
    const root = new Object3D()
    const w = wall()
    root.add(w)
    const res = applyLightmapsFromIndex(root, indexFor([keyOf(w)]), stubTexture)
    expect(res).toMatchObject({ candidates: 1, applied: 1, context: CTX })
    expect(w.geometry.getAttribute('uv1')).toBeTruthy()
    // The map is bound by a shader injection, not by `material.aoMap` -- that slot compiled
    // the attenuation out entirely (v0.31.7.36/.37), so its absence here is correct.
    expect((w.material as MeshStandardMaterial).customProgramCacheKey()).toContain('visGain')
  })

  it('leaves a mesh untouched when the set has no map for it', () => {
    // The common case with one shared index: an unbaked plan. Must be a no-op, not an error.
    const root = new Object3D()
    const w = wall()
    root.add(w)
    const res = applyLightmapsFromIndex(root, indexFor(['deadbeef']), stubTexture)
    // `context: null` is the honest report for an unbaked plan, and distinguishes it from
    // "recognised the plan but matched nothing", which would be a bug.
    expect(res).toMatchObject({ candidates: 1, applied: 0, context: null })
    expect(w.geometry.getAttribute('uv1')).toBeUndefined()
    expect((w.material as MeshStandardMaterial).customProgramCacheKey()).not.toContain('visGain')
  })

  it('never keys sub-1.5 m meshes, so furniture costs nothing', () => {
    const root = new Object3D()
    root.add(trinket())
    expect(applyLightmapsFromIndex(root, indexFor(['x']), stubTexture)).toMatchObject({
      candidates: 0,
      applied: 0,
    })
  })

  it('keys in WORLD space, so a moved mesh gets a different map', () => {
    // The property that makes one shared index work across plans -- and the bug that matched
    // 0 of 385 meshes when the key was computed in the wrong frame.
    const root = new Object3D()
    const w = wall()
    root.add(w)
    const atOrigin = keyOf(w)
    w.position.set(5, 0, 0)
    const res = applyLightmapsFromIndex(root, indexFor([atOrigin]), stubTexture)
    expect(res.applied).toBe(0)
  })

  it('reports a quiet message on zero hits unless coverage was expected', () => {
    const root = new Object3D()
    for (let i = 0; i < 25; i += 1) root.add(wall(i * 4))
    const quiet = applyLightmapsFromIndex(root, indexFor(['nope']), stubTexture)
    expect(quiet.suspect).toBe(false)
    const loud = applyLightmapsFromIndex(root, indexFor(['nope']), stubTexture, {
      expectCoverage: true,
    })
    expect(loud.suspect).toBe(true)
    expect(loud.report).toContain('ZERO matched')
  })

  it('threads a gain override through to the material patch', () => {
    // The bisect seam (`?aoGain=` in DEV). Verified by compiling the patch callback and
    // reading the uniform, because a gain that silently fails to arrive would look exactly
    // like a term that is too weak -- which is the open question it exists to answer.
    const root = new Object3D()
    const w = wall()
    root.add(w)
    applyLightmapsFromIndex(root, indexFor([keyOf(w)]), stubTexture, { gain: 42 })
    const shader = {
      uniforms: {} as Record<string, { value: number }>,
      vertexShader: 'void main() {\n#include <begin_vertex>\n}',
      fragmentShader:
        'void main() {\n#include <lights_fragment_end>\n#include <opaque_fragment>\n}',
    }
    ;(w.material as MeshStandardMaterial).onBeforeCompile(shader as never, null as never)
    expect(shader.uniforms.visGain.value).toBe(42)
  })

  it('MULTIPLIES the bake scale into the gain, so the map returns to its baked units', () => {
    // `scale` is the divisor the bake applied before saving a >1.0 float buffer into an integer
    // PNG. It must come back in, and it must come back in SEPARATELY from the fitted gain:
    // `v0.31.7.104` found the irradiance set clipped with a mean of 9.4 against a 1.0 ceiling,
    // and the "gain of ~14" that seemed to fix it was silently standing in for this factor.
    const root = new Object3D()
    const w = wall()
    root.add(w)
    const parsed = parseLightmapIndex({
      version: 2,
      pass: 'irradiance',
      uv: 'box-atlas-3x2',
      scale: 3,
      maps: [{ key: keyOf(w), file: 'a.png', ctx: CTX }],
    })
    if (!('index' in parsed)) throw new Error('bad fixture')
    applyLightmapsFromIndex(root, parsed.index, stubTexture, { gain: 5, mode: 'replace' })
    const shader = {
      uniforms: {} as Record<string, { value: number }>,
      vertexShader: 'void main() {\n#include <begin_vertex>\n}',
      fragmentShader:
        'void main() {\n#include <lights_fragment_end>\n#include <opaque_fragment>\n}',
    }
    ;(w.material as MeshStandardMaterial).onBeforeCompile(shader as never, null as never)
    expect(shader.uniforms.visGain.value).toBe(15)
  })

  it('leaves the gain alone when the index declares no scale', () => {
    const root = new Object3D()
    const w = wall()
    root.add(w)
    applyLightmapsFromIndex(root, indexFor([keyOf(w)]), stubTexture, { gain: 7 })
    const shader = {
      uniforms: {} as Record<string, { value: number }>,
      vertexShader: 'void main() {\n#include <begin_vertex>\n}',
      fragmentShader:
        'void main() {\n#include <lights_fragment_end>\n#include <opaque_fragment>\n}',
    }
    ;(w.material as MeshStandardMaterial).onBeforeCompile(shader as never, null as never)
    expect(shader.uniforms.visGain.value).toBe(7)
  })

  it('applies only ONE plan’s maps when a key exists in two', () => {
    // Real data: 20 of 65 meshes in the 5-Room plan share a key with the 4-Room set, because
    // HDB layouts repeat wall positions. Mixing two plans' visibility is worse than none.
    const root = new Object3D()
    const w = wall()
    const w2 = wall(9)
    root.add(w, w2)
    const parsed = parseLightmapIndex({
      version: 2,
      pass: 'visibility',
      uv: 'box-atlas-3x2',
      maps: [
        { key: keyOf(w), file: 'shared-a.png', ctx: 'planA' },
        { key: keyOf(w), file: 'shared-b.png', ctx: 'planB' },
        { key: keyOf(w2), file: 'b-only.png', ctx: 'planB' },
      ],
    })
    if (!('index' in parsed)) throw new Error('bad fixture')
    const urls: string[] = []
    applyLightmapsFromIndex(root, parsed.index, (u) => {
      urls.push(u)
      return stubTexture()
    })
    // planB wins on 2 matches to planA's 1, so the shared mesh must take planB's file.
    expect(urls.some((u) => u.endsWith('shared-b.png'))).toBe(true)
    expect(urls.some((u) => u.endsWith('shared-a.png'))).toBe(false)
  })

  it('detaches the previous plan’s maps before applying, and reports how many', () => {
    // The plan-change path: materials survive it, so re-running must clear first.
    const root = new Object3D()
    const w = wall()
    root.add(w)
    const index = indexFor([keyOf(w)])
    expect(applyLightmapsFromIndex(root, index, stubTexture).detached).toBe(0)
    const second = applyLightmapsFromIndex(root, index, stubTexture)
    expect(second.detached).toBe(1)
    expect(second.applied).toBe(1)
  })

  it('does not re-create uv1 that already exists', () => {
    // Re-running must be cheap and must not clobber a bake-matched attribute.
    const root = new Object3D()
    const w = wall()
    root.add(w)
    const index = indexFor([keyOf(w)])
    applyLightmapsFromIndex(root, index, stubTexture)
    const first = w.geometry.getAttribute('uv1')
    applyLightmapsFromIndex(root, index, stubTexture)
    expect(w.geometry.getAttribute('uv1')).toBe(first)
  })
})

describe('mode threading (v0.31.7.89)', () => {
  it('defaults to multiply, so an index cannot silently REPLACE the fill', () => {
    // A `visibility` map is a [0,1] occlusion ratio. Applied as a replacement it
    // would stand in for the ENTIRE fill at map*gain, a different and much darker
    // picture than the one it was baked for. The default has to be the safe one.
    const root = new Object3D()
    const w = wall()
    root.add(w)
    applyLightmapsFromIndex(root, indexFor([keyOf(w)]), stubTexture)
    expect((w.material as MeshStandardMaterial).customProgramCacheKey()).toContain(':multiply')
  })

  it('threads an explicit replace mode into the program cache key', () => {
    // The key must differ, or three serves `replace` from `multiply`'s compiled
    // program -- the collapse `v0.31.7.44` already paid for once.
    const root = new Object3D()
    const w = wall()
    root.add(w)
    applyLightmapsFromIndex(root, indexFor([keyOf(w)]), stubTexture, { mode: 'replace' })
    expect((w.material as MeshStandardMaterial).customProgramCacheKey()).toContain(':replace')
  })
})

describe('per-map scale', () => {
  it('uses the ENTRY scale in preference to the index-level one', () => {
    // Under `--per-map-scale` every map is normalised to its own maximum, so applying one
    // factor to all of them flattens exactly the between-mesh ratios a GI bake carries.
    const root = new Object3D()
    const w = wall()
    root.add(w)
    const parsed = parseLightmapIndex({
      version: 2,
      pass: 'irradiance',
      uv: 'box-atlas-3x2',
      scale: 100,
      maps: [{ key: keyOf(w), file: 'a.png', ctx: CTX, scale: 3 }],
    })
    if (!('index' in parsed)) throw new Error('bad fixture')
    applyLightmapsFromIndex(root, parsed.index, stubTexture, { gain: 2, mode: 'replace' })
    const shader = {
      uniforms: {} as Record<string, { value: number }>,
      vertexShader: 'void main() {\n#include <begin_vertex>\n}',
      fragmentShader:
        'void main() {\n#include <lights_fragment_end>\n#include <opaque_fragment>\n}',
    }
    ;(w.material as MeshStandardMaterial).onBeforeCompile(shader as never, null as never)
    // 3 (the map's own) x 2 (gain) -- NOT 100 x 2.
    expect(shader.uniforms.visGain.value).toBe(6)
  })

  it('falls back to the index-level scale when the entry has none', () => {
    const root = new Object3D()
    const w = wall()
    root.add(w)
    const parsed = parseLightmapIndex({
      version: 2,
      pass: 'irradiance',
      uv: 'box-atlas-3x2',
      scale: 5,
      maps: [{ key: keyOf(w), file: 'a.png', ctx: CTX }],
    })
    if (!('index' in parsed)) throw new Error('bad fixture')
    applyLightmapsFromIndex(root, parsed.index, stubTexture, { gain: 2, mode: 'replace' })
    const shader = {
      uniforms: {} as Record<string, { value: number }>,
      vertexShader: 'void main() {\n#include <begin_vertex>\n}',
      fragmentShader:
        'void main() {\n#include <lights_fragment_end>\n#include <opaque_fragment>\n}',
    }
    ;(w.material as MeshStandardMaterial).onBeforeCompile(shader as never, null as never)
    expect(shader.uniforms.visGain.value).toBe(10)
  })

  it('REFUSES an unusable per-map scale rather than treating it as 1', () => {
    for (const bad of [0, -1, Number.NaN]) {
      const r = parseLightmapIndex({
        version: 2,
        pass: 'irradiance',
        uv: 'box-atlas-3x2',
        maps: [{ key: 'k', file: 'a.png', ctx: CTX, scale: bad }],
      })
      expect('error' in r, `scale ${String(bad)} should be refused`).toBe(true)
    }
  })
})
