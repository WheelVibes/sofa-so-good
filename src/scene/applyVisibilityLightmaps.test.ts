// @vitest-environment node
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
} from 'three'
import { describe, expect, it } from 'vitest'
import { markGlazing } from '../apartment/walls/wallReveal'

/** Shape of the `visGain` vec3 uniform, which the shader stubs type loosely. */
type Vec3 = { x: number; y: number; z: number }

import { pointInBuilding, type WallSeg } from '../floorplan/footprint'
import {
  applyLightmapsFromIndex,
  detachAllVisibilityLightmaps,
  SKY_TINT_STRENGTH,
  surfaceOrientation,
} from './applyVisibilityLightmaps'
import { type LightmapIndex, parseLightmapIndex } from './lightmapIndex'
import { lightmapKey } from './lightmapKey'
import { visGainLuminance } from './visibilityLightmap'

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

/** A 3x2 m glazing pane, marked exactly as `Window.tsx`/`PlanShell.tsx` mark their pane meshes. */
function glazingWall(x = 0): Mesh {
  const g = new BufferGeometry()
  const p = new Float32Array([x, 0, 0, x + 3, 0, 0, x + 3, 2, 0, x, 2, 0])
  g.setAttribute('position', new BufferAttribute(p, 3))
  g.setIndex([0, 1, 2, 0, 2, 3])
  const mesh = new Mesh(g, new MeshStandardMaterial())
  mesh.userData = markGlazing()
  return mesh
}

/** A shell-sized mesh on a transmissive `MeshPhysicalMaterial`, UNMARKED — the belt-and-braces
 *  guard must catch it on the material alone. */
function transmissiveWall(x = 0): Mesh {
  const g = new BufferGeometry()
  const p = new Float32Array([x, 0, 0, x + 3, 0, 0, x + 3, 2, 0, x, 2, 0])
  g.setAttribute('position', new BufferAttribute(p, 3))
  g.setIndex([0, 1, 2, 0, 2, 3])
  return new Mesh(g, new MeshPhysicalMaterial({ transmission: 0.9 }))
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
    expect((w.material as MeshStandardMaterial).customProgramCacheKey()).toContain('visLightmap')
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
    expect((w.material as MeshStandardMaterial).customProgramCacheKey()).not.toContain(
      'visLightmap',
    )
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
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: 'void main() {\n#include <begin_vertex>\n}',
      fragmentShader:
        'void main() {\n#include <lights_fragment_end>\n#include <opaque_fragment>\n}',
    }
    ;(w.material as MeshStandardMaterial).onBeforeCompile(shader as never, null as never)
    expect(visGainLuminance(shader.uniforms.visGain.value as Vec3)).toBeCloseTo(42, 6)
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
    applyLightmapsFromIndex(root, parsed.index, stubTexture, { gain: 5 })
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: 'void main() {\n#include <begin_vertex>\n}',
      fragmentShader:
        'void main() {\n#include <lights_fragment_end>\n#include <opaque_fragment>\n}',
    }
    ;(w.material as MeshStandardMaterial).onBeforeCompile(shader as never, null as never)
    expect(visGainLuminance(shader.uniforms.visGain.value as Vec3)).toBeCloseTo(15, 6)
  })

  it('leaves the gain alone when the index declares no scale', () => {
    const root = new Object3D()
    const w = wall()
    root.add(w)
    applyLightmapsFromIndex(root, indexFor([keyOf(w)]), stubTexture, { gain: 7 })
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: 'void main() {\n#include <begin_vertex>\n}',
      fragmentShader:
        'void main() {\n#include <lights_fragment_end>\n#include <opaque_fragment>\n}',
    }
    ;(w.material as MeshStandardMaterial).onBeforeCompile(shader as never, null as never)
    expect(visGainLuminance(shader.uniforms.visGain.value as Vec3)).toBeCloseTo(7, 6)
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

describe('the single operator (v0.31.7.185)', () => {
  it('keys the program on the gain alone — there is no mode left to thread', () => {
    // This suite used to assert that `multiply` was the DEFAULT, so a `visibility` index could
    // not silently be applied as a replacement. `(z)`5 removed that operator outright, so the
    // protection moved upstream: `VisibilityLightmaps` now REFUSES a non-irradiance index rather
    // than choosing an operator for it. What remains to pin here is that the key marks the
    // injection at all -- an un-injected material keeps three's default key and must not collide.
    //
    // The GAIN is no longer in the key (`(z9)`): it is a uniform value that changes no shader
    // source, and keying on it cost ~195 programs per plan and a 1130-1224 ms load hitch.
    // `v0.31.7.44`'s collapse is instead prevented by a per-material GENERATION, asserted in
    // `visibilityLightmap.test.ts`.
    const root = new Object3D()
    const w = wall()
    root.add(w)
    applyLightmapsFromIndex(root, indexFor([keyOf(w)]), stubTexture)
    const key = (w.material as MeshStandardMaterial).customProgramCacheKey()
    expect(key).toContain('visLightmap')
    expect(key).not.toContain('multiply')
    expect(key).not.toContain('replace')
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
    applyLightmapsFromIndex(root, parsed.index, stubTexture, { gain: 2 })
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: 'void main() {\n#include <begin_vertex>\n}',
      fragmentShader:
        'void main() {\n#include <lights_fragment_end>\n#include <opaque_fragment>\n}',
    }
    ;(w.material as MeshStandardMaterial).onBeforeCompile(shader as never, null as never)
    // 3 (the map's own) x 2 (gain) -- NOT 100 x 2.
    expect(visGainLuminance(shader.uniforms.visGain.value as Vec3)).toBeCloseTo(6, 6)
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
    applyLightmapsFromIndex(root, parsed.index, stubTexture, { gain: 2 })
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: 'void main() {\n#include <begin_vertex>\n}',
      fragmentShader:
        'void main() {\n#include <lights_fragment_end>\n#include <opaque_fragment>\n}',
    }
    ;(w.material as MeshStandardMaterial).onBeforeCompile(shader as never, null as never)
    expect(visGainLuminance(shader.uniforms.visGain.value as Vec3)).toBeCloseTo(10, 6)
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

describe('conflict reporting (v0.31.7.130)', () => {
  it('reports the conflict count, so a SKIPPED mesh is distinguishable from an unmatched one', () => {
    // `conflicts` gated a `continue` since the UV builder existed and was never surfaced, so
    // "skipped because a vertex straddles two atlas slots" and "no map for this key" looked
    // identical from outside. Measured 0 on the real scene once reported, which eliminated it as
    // the cause of the edge artefact — but only because it became visible.
    const root = new Object3D()
    const w = wall()
    root.add(w)
    const res = applyLightmapsFromIndex(root, indexFor([keyOf(w)]), stubTexture)
    expect(res.conflicts).toBe(0)
    expect(res.report).not.toContain('SKIPPED')
  })

  it('REFUSES to patch a material shared with a mesh that has no map — the black-floor guard', () => {
    // `v0.31.7.174` shipped and reverted the feature over this. The injection patches a MATERIAL
    // while `uv1` is built per GEOMETRY, so a material shared by N meshes carries one texture for
    // all of them — and a sharer that was never keyed has no `uv1`, samples undefined coordinates,
    // and in `'replace'` mode is ASSIGNED that. Not a dim surface: a cliff to black. Measured in
    // the app as the bedroom3 wood floor going 126.7 -> 24.4 counts with the warm cast lost, on
    // 2 materials that carried 18 of the 52 mapped meshes.
    const root = new Object3D()
    const mapped = wall()
    const shared = wall(10) // far away, so it keys differently and gets no map below
    // THE thing under test: one material object on both meshes.
    shared.material = mapped.material
    root.add(mapped)
    root.add(shared)
    // Only `mapped`'s key is in the index, so `shared` would ride the patch with no `uv1`.
    const original = mapped.material
    const res = applyLightmapsFromIndex(root, indexFor([keyOf(mapped)]), stubTexture)
    // The mapped mesh still gets its map — via a private CLONE (`v0.31.7.178`); skipping was
    // `.175`'s safe first move and cost the GI on every floor in the flat.
    expect(res.applied).toBe(1)
    expect(res.report).toContain('CLONED off a shared one')
    // THE INVARIANT: the unmapped sharer keeps a clean, unpatched material. This is the assertion
    // that would have caught the black floor — it renders the original, which must never carry a
    // map it has no `uv1` for.
    expect(shared.material).toBe(original)
    expect((original as MeshStandardMaterial).userData.visLightmap).toBeUndefined()
    // ...and the mapped mesh is no longer sharing it.
    expect(mapped.material).not.toBe(original)
    expect((mapped.material as MeshStandardMaterial).userData.visLightmap).toBe(true)
  })

  it('restores the shared original on detach, so turning the feature off leaves no private copy', () => {
    const root = new Object3D()
    const mapped = wall()
    const shared = wall(10)
    shared.material = mapped.material
    const original = mapped.material
    root.add(mapped)
    root.add(shared)
    applyLightmapsFromIndex(root, indexFor([keyOf(mapped)]), stubTexture)
    expect(mapped.material).not.toBe(original)
    detachAllVisibilityLightmaps(root)
    expect(mapped.material).toBe(original)
  })

  it('still patches a material that only ONE mesh renders', () => {
    // The guard must not be a blanket refusal: the common case is one mesh per material, and
    // turning that off would silently disable the feature rather than fix it.
    const root = new Object3D()
    const w = wall()
    root.add(w)
    const res = applyLightmapsFromIndex(root, indexFor([keyOf(w)]), stubTexture)
    expect(res.applied).toBe(1)
    expect(res.report).not.toContain('shared material')
  })
})

describe('surfaceOrientation (item (z8))', () => {
  /** A one-quad mesh whose LOCAL normal is +Z, like `PlaneGeometry`. */
  const quad = () => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(9), 3))
    g.setAttribute('normal', new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3))
    return new Mesh(g, new MeshStandardMaterial())
  }

  it('classifies a floor UP and a ceiling DOWN from the WORLD normal', () => {
    // The local normal is +Z on both: a floor is that quad rotated -pi/2 about X and a ceiling is
    // the same quad rotated +pi/2. Reading the local attribute alone would call both of them
    // `side`, which is the whole reason this goes through the world matrix.
    const floor = quad()
    floor.rotation.x = -Math.PI / 2
    expect(surfaceOrientation(floor)).toBe('up')

    const ceiling = quad()
    ceiling.rotation.x = Math.PI / 2
    expect(surfaceOrientation(ceiling)).toBe('down')

    expect(surfaceOrientation(quad())).toBe('side')
  })

  it('honours a PARENT transform, not just the mesh own rotation', () => {
    // `(z10)` suspected this classifier of reading an unsettled matrix, and the suspicion was
    // wrong — but only because it calls `updateWorldMatrix(true, false)`. A floor parented under
    // a rotated group is the case that would break if that `true` were ever dropped.
    const group = new Object3D()
    group.rotation.x = -Math.PI / 2
    const flat = quad()
    group.add(flat)
    expect(surfaceOrientation(flat)).toBe('up')
  })

  it('falls back to `side` when there is no normal to read', () => {
    // Ambiguity takes the MIDDLE tint rather than an extreme, so a mesh the classifier cannot
    // read is merely un-tuned instead of visibly wrong.
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(9), 3))
    expect(surfaceOrientation(new Mesh(g, new MeshStandardMaterial()))).toBe('side')
  })
})

describe('glazing exclusion (GLAZING-LIGHTMAP, glazingLightmapExclude)', () => {
  it('excludes a marked glazing mesh from candidates and leaves it unpatched', () => {
    // The defect: the pane's ~19% diffuse (transmission 0.81) was carrying a baked irradiance
    // map sampled through a synthesised box-atlas uv1 — grey texel noise that read as night
    // "static" through the glass. Marked glazing must not even be counted as a candidate.
    const root = new Object3D()
    const w = glazingWall()
    root.add(w)
    const res = applyLightmapsFromIndex(root, indexFor([keyOf(w)]), stubTexture, {
      excludeGlazing: true,
    })
    expect(res).toMatchObject({ candidates: 0, applied: 0 })
    expect(w.geometry.getAttribute('uv1')).toBeUndefined()
    expect((w.material as MeshStandardMaterial).userData.visLightmap).toBeUndefined()
  })

  it('excludes a transmissive MeshPhysicalMaterial mesh even when unmarked — belt-and-braces', () => {
    // The mark is the primary guard; a transmissive material is excluded independently in case a
    // future glazing mesh is added without the mark.
    const root = new Object3D()
    const w = transmissiveWall()
    root.add(w)
    const res = applyLightmapsFromIndex(root, indexFor([keyOf(w)]), stubTexture, {
      excludeGlazing: true,
    })
    expect(res).toMatchObject({ candidates: 0, applied: 0 })
    expect(w.geometry.getAttribute('uv1')).toBeUndefined()
  })

  it('patches a marked glazing mesh when excludeGlazing is explicitly false — regression guard', () => {
    // Proves the option is genuinely live and the exclusion above is not just "glazing meshes
    // happen to never key" — with the option off, the same mesh IS patched.
    const root = new Object3D()
    const w = glazingWall()
    root.add(w)
    const res = applyLightmapsFromIndex(root, indexFor([keyOf(w)]), stubTexture, {
      excludeGlazing: false,
    })
    expect(res).toMatchObject({ candidates: 1, applied: 1 })
    expect(w.geometry.getAttribute('uv1')).toBeTruthy()
  })
})

describe('SKY_TINT_STRENGTH (item (z8))', () => {
  it('orders the three orientations the way the physics does', () => {
    // Measured per orientation against Cycles, not chosen: a floor sees sky through the glazing
    // most directly so it carries the MOST sky chroma, and a ceiling faces down onto a warm floor
    // so it carries the least. If a future re-calibration inverts this ordering, something has
    // gone wrong upstream of the numbers.
    expect(SKY_TINT_STRENGTH.up).toBeGreaterThan(SKY_TINT_STRENGTH.side)
    expect(SKY_TINT_STRENGTH.side).toBeGreaterThan(SKY_TINT_STRENGTH.down)
  })

  it('keeps every strength within the lever range', () => {
    // 0 reproduces the old achromatic term and 1 is the full luminance-preserving sky tint;
    // outside that the tint is extrapolating past the sky's own chroma.
    for (const v of Object.values(SKY_TINT_STRENGTH)) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
})

describe('EXTERIOR-FACE-LIGHTMAP (insideBuilding)', () => {
  /** A 10 x 10 m square building, exterior walls as centre-line segments. */
  const OUTLINE: WallSeg[] = [
    { start: [0, 0], end: [10, 0] },
    { start: [10, 0], end: [10, 10] },
    { start: [10, 10], end: [0, 10] },
    { start: [0, 10], end: [0, 0] },
  ]
  const inside = (x: number, z: number) => pointInBuilding(x, z, OUTLINE)

  /** A 10 x 2.6 x 0.2 m shell wall box straddling the `z = 0` outline edge end to end — the
   *  geometry the defect lives on: the bake filled only its room-facing slots, and the UV
   *  builder's mirror row then handed the outward face the interior face's irradiance. Spanning
   *  the whole edge puts its end caps at the building's corners, which is where a real façade
   *  wall's ends are; a wall that STOPS mid-edge is covered by its own test below. */
  const strad = () =>
    new Mesh(new BoxGeometry(10, 2.6, 0.2).translate(5, 1.3, 0), new MeshStandardMaterial())

  const uv1Of = (m: Mesh) => m.geometry.getAttribute('uv1') as BufferAttribute

  it('sentinels the outward faces and leaves the room-facing one on the atlas', () => {
    const root = new Object3D()
    const w = strad()
    root.add(w)
    const res = applyLightmapsFromIndex(root, indexFor([keyOf(w)]), stubTexture, {
      insideBuilding: inside,
    })
    expect(res).toMatchObject({ applied: 1, exteriorConflicts: 0 })
    expect(res.exteriorFaces).toBeGreaterThan(0)

    const uv = uv1Of(w)
    const nrm = w.geometry.getAttribute('normal')
    let sentinels = 0
    for (let v = 0; v < uv.count; v += 1) {
      const sentinel = uv.getX(v) === -1 && uv.getY(v) === -1
      if (Math.abs(nrm.getY(v)) > 0.5) {
        // Top/bottom: a floor or ceiling can never face out of the building, so it is not tested.
        expect(sentinel).toBe(false)
      } else if (nrm.getZ(v) > 0.5) {
        // The ROOM-FACING face keeps a real atlas uv: its outward probe goes into the room, which
        // is still inside the wall centre-lines.
        expect(sentinel).toBe(false)
        expect(uv.getX(v)).toBeGreaterThanOrEqual(0)
        expect(uv.getX(v)).toBeLessThanOrEqual(1)
        expect(uv.getY(v)).toBeGreaterThanOrEqual(0)
        expect(uv.getY(v)).toBeLessThanOrEqual(1)
      }
      if (sentinel) sentinels += 1
    }
    // The −Z face alone is 4 duplicated corners; the end caps of a box centred on the outline are
    // outside too, so the count is at least that.
    expect(sentinels).toBeGreaterThanOrEqual(4)
    expect(res.report).toContain('exterior face(s)')
  })

  it('marks NOTHING when no predicate is supplied — the pre-fix render, exactly', () => {
    const root = new Object3D()
    const w = strad()
    root.add(w)
    const res = applyLightmapsFromIndex(root, indexFor([keyOf(w)]), stubTexture)
    expect(res).toMatchObject({ applied: 1, exteriorFaces: 0, exteriorConflicts: 0 })
    const uv = uv1Of(w)
    for (let v = 0; v < uv.count; v += 1) {
      expect(uv.getX(v)).toBeGreaterThanOrEqual(0)
      expect(uv.getY(v)).toBeGreaterThanOrEqual(0)
    }
    expect(res.report).not.toContain('exterior face(s)')
  })

  it('REPORTS the end-cap disagreement of a wall that stops mid-edge instead of hiding it', () => {
    // A 3 m box centred on the outline and ending mid-façade: each end cap's two triangles have
    // centroids 3.3 cm either side of the centre-line, so one is outside and one inside and they
    // share two vertices. A per-vertex attribute cannot represent that, and the sentinel wins —
    // which on a 0.2 m end cap is immaterial, but it is COUNTED rather than silently resolved,
    // because "the count is zero" is the assertion the shell geometry is supposed to satisfy.
    const root = new Object3D()
    const w = new Mesh(
      new BoxGeometry(3, 2.6, 0.2).translate(5, 1.3, 0),
      new MeshStandardMaterial(),
    )
    root.add(w)
    const res = applyLightmapsFromIndex(root, indexFor([keyOf(w)]), stubTexture, {
      insideBuilding: inside,
    })
    expect(res.exteriorConflicts).toBe(4)
    expect(res.report).toContain('exterior uv1 CONFLICT(s)')
  })

  it('marks nothing on a mesh wholly inside the building', () => {
    const root = new Object3D()
    const w = new Mesh(
      new BoxGeometry(3, 2.6, 0.2).translate(5, 1.3, 5),
      new MeshStandardMaterial(),
    )
    root.add(w)
    const res = applyLightmapsFromIndex(root, indexFor([keyOf(w)]), stubTexture, {
      insideBuilding: inside,
    })
    expect(res).toMatchObject({ applied: 1, exteriorFaces: 0, exteriorConflicts: 0 })
  })
})

describe('ORBIT-NIGHT-CAPS (cutCapY)', () => {
  const CUT_Y = 2.6
  /** A wall box standing floor -> ceiling: its TOP face is the orbit section cut. */
  const wallToCeiling = () =>
    new Mesh(new BoxGeometry(4, CUT_Y, 0.1).translate(5, CUT_Y / 2, 5), new MeshStandardMaterial())
  /** A 0.9 m worktop: an up-facing box top with the same unfilled atlas slot, never sectioned. */
  const worktop = () =>
    new Mesh(new BoxGeometry(2, 0.9, 0.6).translate(5, 0.45, 5), new MeshStandardMaterial())

  const uv1Of = (m: Mesh) => m.geometry.getAttribute('uv1') as BufferAttribute
  const isSentinel = (uv: BufferAttribute, v: number) => uv.getX(v) === -1 && uv.getY(v) === -1

  it("sentinels a wall's top face only when cutCapY is passed", () => {
    const root = new Object3D()
    const w = wallToCeiling()
    root.add(w)
    const res = applyLightmapsFromIndex(root, indexFor([keyOf(w)]), stubTexture, {
      cutCapY: CUT_Y,
    })
    expect(res).toMatchObject({ applied: 1, cutCapFaces: 2, cutCapConflicts: 0 })
    const uv = uv1Of(w)
    const nrm = w.geometry.getAttribute('normal')
    for (let v = 0; v < uv.count; v += 1) expect(isSentinel(uv, v)).toBe(nrm.getY(v) > 0.9)
    expect(res.report).toContain('cut-cap face(s)')
  })

  it('marks NOTHING without cutCapY - the pre-fix render, exactly', () => {
    const root = new Object3D()
    const w = wallToCeiling()
    root.add(w)
    const res = applyLightmapsFromIndex(root, indexFor([keyOf(w)]), stubTexture)
    expect(res).toMatchObject({ applied: 1, cutCapFaces: 0, cutCapConflicts: 0 })
    const uv = uv1Of(w)
    for (let v = 0; v < uv.count; v += 1) {
      expect(uv.getX(v)).toBeGreaterThanOrEqual(0)
      expect(uv.getY(v)).toBeGreaterThanOrEqual(0)
    }
    expect(res.report).not.toContain('cut-cap face(s)')
  })

  it('leaves a worktop-height top face on the atlas', () => {
    // The over-reach guard: a worktop, shelf or sill top has the identical empty-slot problem but
    // is never sectioned, so touching it would change the walk render for no reason.
    const root = new Object3D()
    const w = worktop()
    root.add(w)
    const res = applyLightmapsFromIndex(root, indexFor([keyOf(w)]), stubTexture, {
      cutCapY: CUT_Y,
    })
    expect(res).toMatchObject({ applied: 1, cutCapFaces: 0 })
    const uv = uv1Of(w)
    for (let v = 0; v < uv.count; v += 1) expect(isSentinel(uv, v)).toBe(false)
  })
})
