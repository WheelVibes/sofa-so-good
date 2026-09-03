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
    expect(res).toMatchObject({ candidates: 1, applied: 1 })
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
    expect(res).toMatchObject({ candidates: 1, applied: 0 })
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
