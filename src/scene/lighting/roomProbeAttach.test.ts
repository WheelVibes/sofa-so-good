import type { Texture } from 'three'
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture as ThreeTexture } from 'three'
import { describe, expect, it } from 'vitest'
import {
  applyVisibilityLightmap,
  IRRADIANCE_GAIN,
  setVisDayLevel,
  visGainLuminance,
} from '../visibilityLightmap'
import type { RoomProbe } from './roomProbe'
import {
  attachRoomProbe,
  attachRoomProbes,
  detachAllRoomProbes,
  detachRoomProbe,
  effectiveRoughness,
  isProbeCandidate,
  limitProbeRooms,
  type ProbeableMaterial,
  ROOM_PROBE_MAX_ROUGHNESS,
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
