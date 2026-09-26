import type { Texture } from 'three'
import {
  Box3,
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Texture as ThreeTexture,
  Vector3,
} from 'three'
import { afterEach, describe, expect, it } from 'vitest'
import { generalSockets, resolveWallFittings } from '../../apartment/fittings/fittingModel'
import { buildMergedCatalog } from '../../furniture/catalog'
import { deriveElectricalPoints } from '../../furniture/mepSuggest'
import { useStore } from '../../state/store'
import {
  applyVisibilityLightmap,
  IRRADIANCE_GAIN,
  setVisDayLevel,
  visGainLuminance,
} from '../visibilityLightmap'
import { planRoomProbes, probeAt, type RoomProbe } from './roomProbe'
import {
  attachedRoomProbeCount,
  attachRoomProbe,
  attachRoomProbes,
  detachAllRoomProbes,
  detachRoomProbe,
  effectiveRoughness,
  isProbeCandidate,
  limitProbeRooms,
  type ProbeableMaterial,
  ROOM_PROBE_MAX_ROUGHNESS,
  ROOM_PROBE_SHARPNESS_EXPONENT,
  rankProbeRooms,
  type ShaderLike,
  selectProbeMeshes,
} from './roomProbeAttach'

const probe = (roomId: string, x: number, z: number, half = 1): RoomProbe => ({
  roomId,
  center: [x, 1.3, z],
  boxMin: [x - half, 0, z - half],
  boxMax: [x + half, 2.6, z + half],
})

const fakeTexture = { uuid: 't' } as unknown as Texture

const fakeMaterial = (over: Partial<ProbeableMaterial> = {}): ProbeableMaterial => ({
  uuid: Math.random().toString(36).slice(2),
  roughness: 0.2,
  isMeshStandardMaterial: true,
  userData: {},
  ...over,
})

const fakeShader = (): ShaderLike => ({
  vertexShader: 'void main() {\n#include <begin_vertex>\n#include <worldpos_vertex>\n}',
  fragmentShader: '#include <envmap_physical_pars_fragment>\nvoid main() {}',
  uniforms: {},
})

/**
 * A shader stub carrying the anchors BOTH patches need — the probe's envmap chunk and the
 * lightmap's `lights_fragment_end`. `fakeShader` has only the first, which is why it cannot see
 * a dropped bake.
 */
const realShader = (): ShaderLike => ({
  vertexShader: 'void main() {\n#include <begin_vertex>\n#include <worldpos_vertex>\n}',
  fragmentShader:
    '#include <envmap_physical_pars_fragment>\nvoid main() {\n#include <lights_fragment_end>\n#include <opaque_fragment>\n}',
  uniforms: {},
})

/**
 * The injected baked irradiance for a unit lightmap texel, in LINEAR, as Rec.709 luminance.
 *
 * This is the shader's own `visOcclusion * visGain * visDay` with `visOcclusion = 1`. A material
 * that lost its patch binds none of these uniforms and reads exactly 0 — which is what the bug
 * produced and what a string assertion could not tell from a working clone.
 */
const bakedIrradiance = (shader: ShaderLike): number => {
  const gain = shader.uniforms.visGain?.value as { x: number; y: number; z: number } | undefined
  const day = shader.uniforms.visDay?.value as number | undefined
  if (!gain || typeof day !== 'number' || !shader.uniforms.visMap?.value) return 0
  return visGainLuminance(gain) * day
}

// The attached set is module state, so one test's leftovers would inflate the next test's detach
// count. Sweeping an empty root detaches every orphan and clears it.
afterEach(() => {
  detachAllRoomProbes(new Group())
})

describe('isProbeCandidate', () => {
  it('takes a glossy standard material', () => {
    expect(isProbeCandidate(fakeMaterial({ roughness: 0.14 }))).toBe(true)
  })

  it('rejects matt surfaces — most of an HDB shell, and all of it wasted cost', () => {
    // Painted plaster is 0.92 and the ceiling is 1.0. At those roughnesses `textureCubeUV` is
    // reading a handful of texels and a room and a studio average to the same colour.
    expect(isProbeCandidate(fakeMaterial({ roughness: 0.92 }))).toBe(false)
    expect(isProbeCandidate(fakeMaterial({ roughness: ROOM_PROBE_MAX_ROUGHNESS + 0.001 }))).toBe(
      false,
    )
    expect(isProbeCandidate(fakeMaterial({ roughness: ROOM_PROBE_MAX_ROUGHNESS }))).toBe(true)
  })

  it('rejects a non-standard material, which has no envmap chunk to patch', () => {
    expect(isProbeCandidate(fakeMaterial({ isMeshStandardMaterial: false }))).toBe(false)
    expect(isProbeCandidate(null)).toBe(false)
  })

  it("rejects drei's MeshReflectorMaterial, which already has a REAL reflection", () => {
    // The bathroom mirrors on `realistic`. It extends MeshStandardMaterial, so nothing else
    // here would catch it.
    expect(isProbeCandidate(fakeMaterial({ roughness: 0, _tDiffuse: { value: null } }))).toBe(false)
  })

  it('folds in the ROUGHNESS MAP, which is where this codebase keeps the real value', () => {
    // `cache.ts`'s procedural branch leaves the scalar at 0.85 and puts the painter's value in
    // the map. `wall-tile-white` — the glazed tile the whole feature was diagnosed on — reports
    // 0.85 and renders at ~0.14. A scalar-only test rejected it, and the first measured A/B
    // duly moved the sink and left the tile at 0.0 linear counts.
    const glazed = fakeMaterial({ roughness: 0.85, roughnessMap: { image: undefined } })
    // No DOM image to sample here, so the mean falls back to 1 and the material is REJECTED —
    // the conservative direction.
    expect(effectiveRoughness(glazed)).toBeCloseTo(0.85, 6)
    expect(isProbeCandidate(glazed)).toBe(false)
    // With no map at all the scalar stands.
    expect(effectiveRoughness(fakeMaterial({ roughness: 0.3 }))).toBeCloseTo(0.3, 6)
  })

  it('rejects a material already carrying a probe, so a re-attach cannot nest wrappers', () => {
    const m = fakeMaterial()
    attachRoomProbe(m, probe('a', 0, 0), fakeTexture)
    expect(isProbeCandidate(m)).toBe(false)
  })
})

describe('attachRoomProbe', () => {
  it('binds every uniform and patches both shaders', () => {
    const m = fakeMaterial()
    const uniforms = attachRoomProbe(m, probe('kitchen', 2, 3), fakeTexture, 1)
    const shader = fakeShader()
    m.onBeforeCompile?.(shader)
    expect(shader.fragmentShader).toContain('roomProbeCorrect')
    expect(shader.vertexShader).toContain('vRoomProbeWorldPos')
    expect(shader.uniforms.roomProbeMap).toBe(uniforms.map)
    expect(shader.uniforms.roomProbeMix?.value).toBe(1)
    expect(uniforms.center.value.toArray()).toEqual([2, 1.3, 3])
    expect(uniforms.boxMin.value.toArray()).toEqual([1, 0, 2])
    expect(uniforms.boxMax.value.toArray()).toEqual([3, 2.6, 4])
  })

  it('COMPOSES with an existing onBeforeCompile instead of clobbering it', () => {
    // The lightmapped shell materials already own one. Replacing it would delete the baked GI
    // from exactly the surfaces this feature targets.
    let ranFirst = false
    const m = fakeMaterial({
      onBeforeCompile: (s: ShaderLike) => {
        ranFirst = true
        s.fragmentShader = `${s.fragmentShader}\n// lightmap`
      },
    })
    attachRoomProbe(m, probe('a', 0, 0), fakeTexture)
    const shader = fakeShader()
    m.onBeforeCompile?.(shader)
    expect(ranFirst).toBe(true)
    expect(shader.fragmentShader).toContain('// lightmap')
    expect(shader.fragmentShader).toContain('roomProbeCorrect')
  })

  it('APPENDS to an existing customProgramCacheKey rather than replacing it', () => {
    const m = fakeMaterial({ customProgramCacheKey: () => 'lightmap-replace' })
    attachRoomProbe(m, probe('a', 0, 0), fakeTexture)
    expect(m.customProgramCacheKey?.()).toBe('lightmap-replace|roomProbe')
  })

  it('uses ONE cache key for every room — the source is identical, only uniforms differ', () => {
    const a = fakeMaterial()
    const b = fakeMaterial()
    attachRoomProbe(a, probe('kitchen', 0, 0), fakeTexture)
    attachRoomProbe(b, probe('bath1', 9, 9), fakeTexture)
    expect(a.customProgramCacheKey?.()).toBe(b.customProgramCacheKey?.())
  })

  it('holds the blend at 0 if three has moved the chunk, rather than binding nothing', () => {
    const m = fakeMaterial()
    const uniforms = attachRoomProbe(m, probe('a', 0, 0), fakeTexture)
    m.onBeforeCompile?.({ vertexShader: 'void main(){}', fragmentShader: '', uniforms: {} })
    expect(uniforms.mix.value).toBe(0)
  })
})

describe('detachRoomProbe', () => {
  it("restores three's own hooks, both of them", () => {
    const prev = (s: ShaderLike) => {
      s.fragmentShader = '// lightmap'
    }
    const prevKey = () => 'lightmap'
    const m = fakeMaterial({ onBeforeCompile: prev, customProgramCacheKey: prevKey })
    attachRoomProbe(m, probe('a', 0, 0), fakeTexture)
    expect(detachRoomProbe(m)).toBe(true)
    expect(m.onBeforeCompile).toBe(prev)
    expect(m.customProgramCacheKey).toBe(prevKey)
    // And it is now attachable again — a one-directional gate is not a gate.
    expect(isProbeCandidate(m)).toBe(true)
  })

  it('is a no-op on an unpatched material', () => {
    expect(detachRoomProbe(fakeMaterial())).toBe(false)
  })
})

describe('selectProbeMeshes / attachRoomProbes on a real object graph', () => {
  const build = () => {
    const root = new Group()
    const glossy = new MeshStandardMaterial({ roughness: 0.14 })
    const matt = new MeshStandardMaterial({ roughness: 0.92 })
    const kitchenTile = new Mesh(new BoxGeometry(0.5, 0.5, 0.5), glossy)
    kitchenTile.position.set(2, 1, 3)
    const bathTile = new Mesh(new BoxGeometry(0.5, 0.5, 0.5), glossy)
    bathTile.position.set(8, 1, 3)
    const wall = new Mesh(new BoxGeometry(0.5, 0.5, 0.5), matt)
    wall.position.set(2, 1, 3)
    const outside = new Mesh(new BoxGeometry(0.5, 0.5, 0.5), glossy)
    outside.position.set(50, 1, 50)
    root.add(kitchenTile, bathTile, wall, outside)
    root.updateMatrixWorld(true)
    return { root, kitchenTile, bathTile, wall, outside, glossy }
  }

  const probes = [probe('kitchen', 2, 3), probe('bath1', 8, 3)]

  it('selects only the glossy meshes that land inside a room box', () => {
    const { root, kitchenTile, bathTile } = build()
    const picked = selectProbeMeshes(root, probes)
    expect(picked.map((p) => p.mesh)).toEqual([kitchenTile, bathTile])
    expect(picked.map((p) => p.probe.roomId)).toEqual(['kitchen', 'bath1'])
  })

  it('returns nothing when the plan produced no probes', () => {
    const { root } = build()
    expect(selectProbeMeshes(root, [])).toEqual([])
  })

  it('CLONES a material shared across two rooms, because the box lives on the material', () => {
    const { root, kitchenTile, bathTile, glossy } = build()
    const result = attachRoomProbes(selectProbeMeshes(root, probes), () => fakeTexture)
    expect(result.attached).toBe(2)
    expect(result.cloned).toBe(2)
    expect(kitchenTile.material).not.toBe(glossy)
    expect(bathTile.material).not.toBe(glossy)
    expect(kitchenTile.material).not.toBe(bathTile.material)
    const km = kitchenTile.material as unknown as { userData: Record<string, unknown> }
    expect(km.userData.roomProbeClone).toBe(true)
  })

  it('the CLONE keeps its baked GI — measured in linear against an in-session control', () => {
    // C1. `Material.clone()` copies neither `onBeforeCompile` nor `customProgramCacheKey` (own
    // properties, which is how `applyVisibilityLightmap` installs the Cycles bake) and
    // JSON-round-trips `userData`. The old version of this test cloned a BARE
    // `MeshStandardMaterial` with no patch, so the loss was unobservable. This one clones a
    // material that has genuinely been through `applyVisibilityLightmap`, and reads the injected
    // irradiance as a NUMBER rather than asserting a string is present.
    const { root, kitchenTile, bathTile, glossy } = build()
    // The CONTROL is in the same session, the same module state and the same attach pass: a
    // second lightmapped material confined to ONE room, which therefore never takes the clone
    // branch. A two-build comparison of this would not be attributable.
    const control = new MeshStandardMaterial({ roughness: 0.14 })
    const controlMesh = new Mesh(new BoxGeometry(0.5, 0.5, 0.5), control)
    controlMesh.position.set(2, 1, 3)
    root.add(controlMesh)
    root.updateMatrixWorld(true)
    const bake = new ThreeTexture()
    applyVisibilityLightmap(glossy, bake, IRRADIANCE_GAIN, false, [1, 1, 1], 0, 0, true)
    applyVisibilityLightmap(control, bake, IRRADIANCE_GAIN, false, [1, 1, 1], 0, 0, true)
    setVisDayLevel(1)

    const result = attachRoomProbes(selectProbeMeshes(root, probes), () => fakeTexture)
    expect(result.cloned).toBe(2)
    const clone = kitchenTile.material as unknown as ProbeableMaterial
    expect(clone).not.toBe(glossy)

    const cloneShader = realShader()
    clone.onBeforeCompile?.(cloneShader)
    const controlShader = realShader()
    ;(control as unknown as ProbeableMaterial).onBeforeCompile?.(controlShader)

    // The bake is not a string assertion: this is the shader's own
    // `visOcclusion * visGain * visDay` for a unit texel, read as Rec.709 luminance in LINEAR.
    expect(bakedIrradiance(controlShader)).toBeCloseTo(IRRADIANCE_GAIN, 6)
    expect(bakedIrradiance(cloneShader)).toBeCloseTo(bakedIrradiance(controlShader), 6)
    // Same MAP object, not a JSON look-alike — a clone that sampled nothing would read 0 above.
    expect(cloneShader.uniforms.visMap?.value).toBe(controlShader.uniforms.visMap?.value)
    // And the probe still rides ON TOP of it rather than instead of it.
    expect(cloneShader.fragmentShader).toContain('roomProbeCorrect')
    expect(cloneShader.fragmentShader).toContain('reflectedLight.indirectDiffuse')
    // R7-L's structural invariant: specular only, `getIBLIrradiance` untouched, `envMap` null.
    const f = cloneShader.fragmentShader
    const irradiance = f.slice(f.indexOf('getIBLIrradiance'), f.indexOf('getIBLRadiance'))
    expect(irradiance).not.toBe('')
    expect(irradiance).not.toContain('roomProbe')
    expect(f.slice(f.indexOf('getIBLRadiance'))).toContain('roomProbe')
    expect((kitchenTile.material as MeshStandardMaterial).envMap).toBeNull()
    expect((bathTile.material as MeshStandardMaterial).envMap).toBeNull()
  })

  it('the CLONE shares the ORIGINAL’s live uniform objects, not dead JSON copies', () => {
    // Second half of C1: `userData` goes through `JSON.parse(JSON.stringify(...))`, so an
    // unrepaired clone holds look-alikes that no setter will ever reach — and a later detach
    // would `.delete()` objects that were never in the Sets.
    const { root, kitchenTile, glossy } = build()
    applyVisibilityLightmap(
      glossy,
      new ThreeTexture(),
      IRRADIANCE_GAIN,
      false,
      [1, 1, 1],
      0,
      0,
      true,
    )
    attachRoomProbes(selectProbeMeshes(root, probes), () => fakeTexture)
    const clone = kitchenTile.material as unknown as ProbeableMaterial
    expect(clone.userData.visDayUniform).toBe(glossy.userData.visDayUniform)
    expect(clone.userData.visNightUniform).toBe(glossy.userData.visNightUniform)
    expect(clone.userData.visLightmapAdopted).toBe(true)

    // One write reaches both, which is the whole point of the shared identity.
    setVisDayLevel(0.25)
    expect((clone.userData.visDayUniform as { value: number }).value).toBeCloseTo(0.25, 6)
    setVisDayLevel(1)

    // Detaching the clone must NOT unregister the uniforms the original still owns.
    detachAllRoomProbes(root)
    expect(kitchenTile.material).toBe(glossy)
    setVisDayLevel(0.5)
    expect((glossy.userData.visDayUniform as { value: number }).value).toBeCloseTo(0.5, 6)
    setVisDayLevel(1)

    // A FRESH apply on the clone takes ownership back: it registers its own uniform objects, so
    // leaving the marker set would make a later detach skip unregistering uniforms nothing else
    // holds — a leak into `lampUniforms` &co. that every `setVisDayLevel` would keep writing to.
    applyVisibilityLightmap(clone as never, new ThreeTexture(), IRRADIANCE_GAIN, false)
    expect(clone.userData.visLightmapAdopted).toBeUndefined()
  })

  it('does NOT clone a material confined to one room', () => {
    const { root, bathTile } = build()
    root.remove(bathTile)
    root.updateMatrixWorld(true)
    const result = attachRoomProbes(selectProbeMeshes(root, probes), () => fakeTexture)
    expect(result.cloned).toBe(0)
    expect(result.materials).toBe(1)
  })

  it('skips a room whose probe texture never arrived', () => {
    const { root } = build()
    const result = attachRoomProbes(selectProbeMeshes(root, probes), (id) =>
      id === 'kitchen' ? fakeTexture : null,
    )
    expect(result.attached).toBe(1)
  })

  it('detaches everything and puts the original shared material back', () => {
    const { root, kitchenTile, glossy } = build()
    attachRoomProbes(selectProbeMeshes(root, probes), () => fakeTexture)
    expect(detachAllRoomProbes(root)).toBe(2)
    expect(kitchenTile.material).toBe(glossy)
    expect(glossy.userData.roomProbeRecord).toBeUndefined()
  })
})

describe('R7-N: a material can be REPLACED under the probe, and a clone must not inherit it', () => {
  const probes = [probe('kitchen', 2, 3)]

  const buildOne = () => {
    const root = new Group()
    const glossy = new MeshStandardMaterial({ roughness: 0.14 })
    const tile = new Mesh(new BoxGeometry(0.5, 0.5, 0.5), glossy)
    tile.position.set(2, 1, 3)
    root.add(tile)
    root.updateMatrixWorld(true)
    return { root, tile, glossy }
  }

  it('the record does NOT survive `Material.clone()`, so the clone is a fresh candidate', () => {
    // three's `Material.copy` is `userData = JSON.parse(JSON.stringify(source.userData))` and
    // copies NEITHER `onBeforeCompile` NOR `customProgramCacheKey`. A plain assignment therefore
    // handed every clone a dead husk of the record with no probe in its shader — which made
    // `isProbeCandidate` refuse it forever and made a `userData`-based census lie. The applier that
    // does this on the default flat is the baked-GI pass: ~550 clones per attach.
    const { glossy } = buildOne()
    attachRoomProbe(glossy as unknown as ProbeableMaterial, probes[0]!, fakeTexture)
    const clone = glossy.clone()
    expect(clone.userData.roomProbeRecord).toBeUndefined()
    expect(isProbeCandidate(clone as unknown as ProbeableMaterial)).toBe(true)
    // The original is still patched and still readable — enumerability is not visibility.
    expect(glossy.userData.roomProbeRecord).toBeDefined()
  })

  it('serialising a patched material does not drag the PMREM texture through JSON', () => {
    // The tell for the bug above was three logging "Unable to serialize Texture." once per clone.
    const { glossy } = buildOne()
    attachRoomProbe(glossy as unknown as ProbeableMaterial, probes[0]!, fakeTexture)
    expect(JSON.stringify(glossy.userData)).toBe('{}')
  })

  it('detachAll sweeps a patched material that is no longer on any mesh', () => {
    // The promotion defect: the mesh moves to a different material generation, the patched one is
    // left off the graph, and a traversal can never reach it again — so it keeps a disposed PMREM
    // bound and `isProbeCandidate` keeps refusing it.
    const { root, tile, glossy } = buildOne()
    attachRoomProbes(selectProbeMeshes(root, probes), () => fakeTexture)
    expect(glossy.userData.roomProbeRecord).toBeDefined()
    expect(attachedRoomProbeCount()).toBe(1)

    tile.material = new MeshStandardMaterial({ roughness: 0.14 })
    root.updateMatrixWorld(true)

    expect(detachAllRoomProbes(root)).toBe(1)
    expect(glossy.userData.roomProbeRecord).toBeUndefined()
    expect(attachedRoomProbeCount()).toBe(0)
  })

  it('re-attaches to the NEW material after a swap, which is the fix for the promotion', () => {
    const { root, tile } = buildOne()
    attachRoomProbes(selectProbeMeshes(root, probes), () => fakeTexture)
    const replacement = new MeshStandardMaterial({ roughness: 0.14 })
    tile.material = replacement
    root.updateMatrixWorld(true)

    // What `RoomProbes`' effect does on a material-set change: detach, then attach again.
    detachAllRoomProbes(root)
    const result = attachRoomProbes(selectProbeMeshes(root, probes), () => fakeTexture)
    expect(result.attached).toBe(1)
    expect(replacement.userData.roomProbeRecord).toBeDefined()
    expect(attachedRoomProbeCount()).toBe(1)
  })

  it('a lightmap-style CLONE of a patched material keeps its own compile hook', () => {
    // `applyVisibilityLightmaps` clones a shared material and then installs its own
    // `onBeforeCompile` on the clone. With the husk present, the probe's next detach pass restored
    // `record.prevOnBeforeCompile ?? (() => {})` on that clone — i.e. it WIPED the baked GI.
    const { root, tile, glossy } = buildOne()
    attachRoomProbe(glossy as unknown as ProbeableMaterial, probes[0]!, fakeTexture)
    // The bake pass: clone the material, hang its own hook on the clone, put it on the mesh.
    const clone = glossy.clone()
    let lightmapRan = 0
    clone.onBeforeCompile = () => {
      lightmapRan++
    }
    tile.material = clone
    root.updateMatrixWorld(true)

    detachAllRoomProbes(root)
    clone.onBeforeCompile(fakeShader() as never, null as never)
    expect(lightmapRan).toBe(1)
  })
})

describe('limitProbeRooms', () => {
  const big = (roomId: string, w: number, h: number, x: number, roughness = 0.2) => {
    const mesh = new Mesh(new BoxGeometry(w, h, 0.1), new MeshStandardMaterial({ roughness }))
    mesh.position.set(x, 1, 0)
    mesh.updateMatrixWorld(true)
    return { mesh, probe: probe(roomId, x, 0, 6) }
  }

  it('keeps the rooms with the most GLOSSY AREA, not the most meshes', () => {
    // A bedroom with four door levers must lose to a bathroom with one tiled wall — which is
    // the whole reason the rank is area and not a count.
    const bathroom = [big('bath1', 2.4, 2.4, 0)]
    const bedroom = [
      big('bed1', 0.05, 0.05, 20),
      big('bed1', 0.05, 0.05, 20),
      big('bed1', 0.05, 0.05, 20),
      big('bed1', 0.05, 0.05, 20),
    ]
    const kept = limitProbeRooms([...bedroom, ...bathroom], 1)
    expect(new Set(kept.map((a) => a.probe.roomId))).toEqual(new Set(['bath1']))
  })

  it('caps the room count, which is the VRAM budget', () => {
    const many = [0, 1, 2, 3, 4, 5].map((i) => big(`r${i}`, 2 + i, 2, i * 20))
    expect(new Set(limitProbeRooms(many, 4).map((a) => a.probe.roomId)).size).toBe(4)
    // …and it keeps the biggest, so the rooms that lose are the ones with least to show.
    expect(limitProbeRooms(many, 1)[0]?.probe.roomId).toBe('r5')
  })

  it('weights AREA by how sharp the reflection is, or the kitchen loses to a bedroom', () => {
    // Measured: unweighted area picked mainBedroom/corridor/bath1/livingDining and dropped the
    // kitchen, because a big vinyl floor at 0.49 outranked a small glazed splashback at 0.14 —
    // and at 0.49 the probe is worth 0.0 linear counts.
    const bedroomFloor = big('mainBedroom', 3.5, 3.0, 0, 0.49)
    const kitchenTile = big('kitchen', 1.2, 1.2, 40, 0.14)
    expect(limitProbeRooms([bedroomFloor, kitchenTile], 1)[0]?.probe.roomId).toBe('kitchen')
  })

  it('is a no-op below the cap', () => {
    const two = [big('a', 2, 2, 0), big('b', 2, 2, 20)]
    expect(limitProbeRooms(two, 4)).toHaveLength(2)
  })
})

/**
 * Live default-flat room scores under the QUARTIC weight (R7-AD) — the census of every probe
 * candidate on the default flat (real GPU, realistic/capable, 13:00, one boot:
 * `scripts/scenarios/room-probes-benefit.mjs`), scored with `ROOM_PROBE_SHARPNESS_EXPONENT`. Under
 * the old square the same census read `bath1 3.05 > kitchen 2.76 > livingDining 2.31 > mainBedroom
 * 2.23 > bath2 1.84 > bedroom2 1.83 > …`, i.e. bath2 fifth-or-sixth by a 0.01-0.03 nose.
 */
const MEASURED_DEFAULT_FLAT: [string, number][] = [
  ['bath1', 0.824],
  ['kitchen', 0.606],
  ['livingDining', 0.593],
  ['bath2', 0.542],
  ['serviceYard', 0.273],
  ['mainBedroom', 0.258],
  ['bedroom2', 0.221],
  ['bedroom3', 0.165],
  ['corridor', 0.006],
]

describe('R7-AD: the ranking tracks VISIBLE benefit, so bath2 beats the bedrooms', () => {
  // Each room as its measured census COMPOSITION, reduced to the bands that decide it: the
  // default flat's mainBedroom carries 12.9 m² of wardrobe front at an effective 0.39 and 14.2 m²
  // of vinyl at 0.50; bath2 carries 16.8 m² of wall tile at 0.46 plus a handful of small sharp
  // fittings (a 0.35 m² mirror-cabinet front at 0.07, 0.26 m² of chrome at 0.16, 0.78 m² in the
  // 0.1-0.2 band). One-boot, linear, per-room on/off measured bath2 at 4.55 and mainBedroom at 2.81
  // (mean |diff| x1000), bedroom2 at 1.57 — the square ranked both bedrooms above bath2.
  const slab = (roomId: string, area: number, roughness: number, x: number) => {
    const side = Math.sqrt(area)
    const mesh = new Mesh(
      new BoxGeometry(side, side, 0.01),
      new MeshStandardMaterial({ roughness }),
    )
    mesh.position.set(x, 1.2, 0)
    mesh.updateMatrixWorld(true)
    return { mesh, probe: probe(roomId, x, 0, 30) }
  }
  const bedroom = () => [slab('mainBedroom', 12.9, 0.39, 0), slab('mainBedroom', 14.2, 0.5, 0)]
  const bathroom = () => [
    slab('bath2', 16.8, 0.46, 100),
    slab('bath2', 0.35, 0.07, 100),
    slab('bath2', 0.26, 0.16, 100),
    slab('bath2', 0.78, 0.15, 100),
  ]

  it('a bathroom of sharp fittings outranks a bedroom of wardrobe fronts and vinyl', () => {
    const ranked = rankProbeRooms([...bedroom(), ...bathroom()]).map(([id]) => id)
    expect(ranked).toEqual(['bath2', 'mainBedroom'])
  })

  it('and the old square is exactly what got this backwards', () => {
    // Pins WHY the exponent moved, so a revert to 2 cannot pass silently as a no-op: under the
    // square, the bedroom's 27 m² of 0.39-0.50 surface outweighs the bathroom.
    const square = (xs: ReturnType<typeof slab>[]) =>
      xs.reduce((sum, a) => {
        const r = (a.mesh.material as MeshStandardMaterial).roughness
        return sum + slabArea(a.mesh) * (1 - r / ROOM_PROBE_MAX_ROUGHNESS) ** 2
      }, 0)
    expect(square(bedroom())).toBeGreaterThan(square(bathroom()))
    expect(ROOM_PROBE_SHARPNESS_EXPONENT).toBe(4)
  })

  it('leaves the candidate cut-off alone: the exponent reorders rooms, it patches nothing new', () => {
    // A wardrobe front at 0.39 is still a probe CANDIDATE — it keeps its patch whenever its room
    // holds a probe. Only the room order moved.
    expect(ROOM_PROBE_MAX_ROUGHNESS).toBe(0.6)
    expect(isProbeCandidate(new MeshStandardMaterial({ roughness: 0.39 }) as never)).toBe(true)
    expect(isProbeCandidate(new MeshStandardMaterial({ roughness: 0.5 }) as never)).toBe(true)
  })
})

/** Largest bounding-box face of a unit-scaled test slab — its footprint as the ranking sees it. */
function slabArea(mesh: Mesh): number {
  const size = new Box3().setFromObject(mesh, true).getSize(new Vector3())
  const dims = [size.x, size.y, size.z].sort((p, q) => q - p)
  return (dims[0] ?? 0) * (dims[1] ?? 0)
}

describe('R7-Z: an InstancedMesh is scored by its INSTANCES, not by the union of them', () => {
  // The store's boot state IS the default furnished flat, so this is the plan and the items the
  // live measurement ran on.
  const state = useStore.getState()
  const plan = state.floorPlan
  const probes = planRoomProbes(plan, 'all')
  const room = (id: string) => {
    const p = probes.find((q) => q.roomId === id)
    if (!p) throw new Error(`default flat has no ${id}`)
    return p
  }

  /**
   * The default flat's REAL wall fittings — derived from the default furniture plus the general
   * sockets, resolved by the same pure model and in the same way `WallFittings.tsx` does — as one InstancedMesh of 86 x 86 mm plates in the
   * shipped glossy polycarbonate — the exact object that bought the corridor its 31.17.
   */
  const fittingsMesh = () => {
    const derived = deriveElectricalPoints(plan, state.items, buildMergedCatalog(state))
    const fittings = resolveWallFittings(plan, [...derived, ...generalSockets(plan, derived)])
    const mesh = new InstancedMesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({ roughness: 0.28 }),
      fittings.length,
    )
    const m = new Matrix4()
    fittings.forEach((f, i) => {
      m.makeRotationY(f.yaw)
      m.scale({ x: 0.086, y: 0.086, z: 0.011 } as never)
      m.setPosition(f.x, f.y, f.z)
      mesh.setMatrixAt(i, m)
    })
    mesh.updateMatrixWorld(true)
    // Plates per room, counted independently of the code under test.
    const perRoom = new Map<string, number>()
    for (const f of fittings) {
      const id = probeAt(probes, f.x, f.z)?.roomId
      if (id) perRoom.set(id, (perRoom.get(id) ?? 0) + 1)
    }
    return { mesh, count: fittings.length, perRoom }
  }

  it('reproduces the trap: three bounds an InstancedMesh by the UNION of its instances', () => {
    // Pins the SETUP, so the regression test below cannot pass by no longer reproducing the bug.
    // `setFromObject(mesh, true)` is NOT precise for an InstancedMesh (three skips the vertex
    // path for them) and returns a flat-sized box centred in the middle of the plan — live, at
    // (6.39, 4.64), inside the corridor's 1 m-wide box. Its largest face is the phantom area.
    const { mesh, count } = fittingsMesh()
    expect(count).toBeGreaterThan(10)
    const union = new Box3().setFromObject(mesh, true)
    const size = union.getSize(union.min.clone())
    expect(size.x * size.z).toBeGreaterThan(50) // tens of m² of "glossy surface"…
    expect(count * 0.086 * 0.086).toBeLessThan(1) // …from under a square metre of plates
  })

  it('bins each instance on its own, and scores plates rather than a flat-sized slab', () => {
    const { mesh, count } = fittingsMesh()
    const root = new Group()
    root.add(mesh)
    const picked = selectProbeMeshes(root, probes)
    expect(picked).toHaveLength(1)
    // It goes to the room holding the most of its plates — not to whichever box holds the
    // centre of the flat.
    const { perRoom } = fittingsMesh()
    const most = Math.max(...perRoom.values())
    expect(perRoom.get(picked[0]?.probe.roomId ?? '')).toBe(most)
    // And its footprint is plates, not a slab: at most every plate's face, i.e. well under 1 m².
    expect(picked[0]?.footprint).toBeLessThanOrEqual(count * 0.086 * 0.086 + 1e-9)
    const score = rankProbeRooms(picked)[0]?.[1] ?? Number.POSITIVE_INFINITY
    expect(score).toBeLessThan(0.1)
  })

  it('an ordinary mesh keeps its old score exactly — the fix only touches instanced meshes', () => {
    const tile = new Mesh(
      new BoxGeometry(1.2, 1.2, 0.02),
      new MeshStandardMaterial({ roughness: 0.14 }),
    )
    const k = room('kitchen')
    tile.position.set(k.center[0], 1.2, k.center[2])
    tile.updateMatrixWorld(true)
    const root = new Group()
    root.add(tile)
    const picked = selectProbeMeshes(root, probes)
    expect(picked[0]?.probe.roomId).toBe('kitchen')
    const sharp = (1 - 0.14 / ROOM_PROBE_MAX_ROUGHNESS) ** ROOM_PROBE_SHARPNESS_EXPONENT
    expect(rankProbeRooms(picked)[0]?.[1]).toBeCloseTo(1.2 * 1.2 * sharp, 6)
    // A hand-built assignment with no footprint is recomputed to the same number.
    expect(rankProbeRooms([{ mesh: tile, probe: k }])[0]?.[1]).toBeCloseTo(1.2 * 1.2 * sharp, 6)
  })

  it('a zero-scaled instance (a plate hidden by the orbit wall fade) contributes nothing', () => {
    const { mesh } = fittingsMesh()
    const zero = new Matrix4().makeScale(0, 0, 0)
    for (let i = 0; i < mesh.count; i++) mesh.setMatrixAt(i, zero)
    const root = new Group()
    root.add(mesh)
    const picked = selectProbeMeshes(root, probes)
    expect(rankProbeRooms(picked).every(([, score]) => score === 0)).toBe(true)
  })

  /**
   * THE CORRECTED DEFAULT-FLAT RANKING. Each room carries one glossy slab sized so its
   * `footprint x sharpness` is that room's score as MEASURED on the live default flat after the
   * fix (real GPU, realistic/capable, 13:00, the R7-AD candidate census, v0.35.18.9) — plus the flat's real wall fittings as
   * the instanced mesh that used to decide the order. The order must come out as measured, and
   * the fittings must not be able to move it: before R7-Z they put the corridor first by 10x.
   */
  it('pins the corrected default-flat order, which the wall fittings can no longer overturn', () => {
    const MEASURED = MEASURED_DEFAULT_FLAT
    const sharp = (1 - 0.14 / ROOM_PROBE_MAX_ROUGHNESS) ** ROOM_PROBE_SHARPNESS_EXPONENT
    const root = new Group()
    for (const [id, score] of MEASURED) {
      const p = room(id)
      const side = Math.sqrt(score / sharp)
      const slab = new Mesh(
        new BoxGeometry(side, side, 0.01),
        new MeshStandardMaterial({ roughness: 0.14 }),
      )
      slab.position.set(p.center[0], 1.2, p.center[2])
      root.add(slab)
    }
    root.add(fittingsMesh().mesh)
    root.updateMatrixWorld(true)
    const ranked = rankProbeRooms(selectProbeMeshes(root, probes)).map(([id]) => id)
    expect(ranked).toEqual(MEASURED.map(([id]) => id))
    // The cap question in one line: bath2 is FOURTH under the quartic weight (R7-AD), so
    // `realistic/capable`'s 4 keeps it (quality.ts `roomProbeMaxRooms`) — sixth under the square.
    expect(ranked.indexOf('bath2')).toBe(3)
  })
})
