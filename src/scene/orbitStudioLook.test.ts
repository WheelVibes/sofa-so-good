import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from '../features/featureFlags'
import { resolveFlags } from '../features/flags/resolve'
import { AO } from './look'
import {
  ORBIT_STUDIO,
  orbitStudioActive,
  orbitStudioAo,
  orbitStudioFillScale,
  orbitStudioKeyIntensity,
  STUDIO_KEY_DIR,
  STUDIO_KEY_SHADOW_TAG,
  studioKeyDirection,
  studioKeyPosition,
  studioShadowRange,
} from './orbitStudioLook'

/**
 * ORBIT-STUDIO-LOOK. The pure half is unit-tested here; the two things that are
 * invisible to `tsc` and to every pure test — the key mounting ONLY under
 * `cameraMode === 'orbit'` in the main scene, and the room editor never being
 * handed it — are asserted against the source text at the bottom, the same way
 * `postStackGuard.test.ts` pins the post stack.
 */

const ON = { allow: true, cameraMode: 'orbit', flagOn: true, shadowMapSize: 1024 }

describe('orbitStudioActive', () => {
  it('is on in orbit, in the main scene, with the flag and a shadow map', () => {
    expect(orbitStudioActive(ON)).toBe(true)
  })

  it('is off in walk mode — walk keeps the real ceiling overhead', () => {
    expect(orbitStudioActive({ ...ON, cameraMode: 'firstPerson' })).toBe(false)
  })

  it('is off wherever the caller does not opt in (the room editor)', () => {
    // The editor is a second canvas over the SAME store, so its `cameraMode` is
    // also `'orbit'` — only the `allow` flag separates them.
    expect(orbitStudioActive({ ...ON, allow: false })).toBe(false)
  })

  it('is off with the feature flag off', () => {
    expect(orbitStudioActive({ ...ON, flagOn: false })).toBe(false)
  })

  it('is off on a tier with no shadow map — it costs a shadow pass', () => {
    expect(orbitStudioActive({ ...ON, shadowMapSize: 0 })).toBe(false)
  })
})

describe('the key direction', () => {
  it('is a unit vector', () => {
    const [x, y, z] = studioKeyDirection()
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 12)
  })

  it('is nearly overhead but NOT vertical', () => {
    const [x, y, z] = studioKeyDirection()
    // Straight down leaves every vertical wall at N·L = 0, i.e. no wall gradient
    // at all — which is half of what the reference frame reads as.
    expect(y).toBeGreaterThan(0.9)
    expect(Math.hypot(x, z)).toBeGreaterThan(0.05)
    // Tilted toward +x and +z, so opposite walls of a room separate.
    expect(x).toBeGreaterThan(0)
    expect(z).toBeGreaterThan(0)
    expect(STUDIO_KEY_DIR[1]).toBe(1)
  })

  it('places the light up its own direction from the plan centre', () => {
    const d = studioKeyDirection()
    const p = studioKeyPosition([4, 0, 3])
    expect(p[0]).toBeCloseTo(4 + d[0] * ORBIT_STUDIO.distance, 9)
    expect(p[1]).toBeCloseTo(d[1] * ORBIT_STUDIO.distance, 9)
    expect(p[2]).toBeCloseTo(3 + d[2] * ORBIT_STUDIO.distance, 9)
  })
})

describe('studioShadowRange', () => {
  const range = studioShadowRange([6, 0, 4], 9.5, 2.6)

  it('brackets the whole plan slab', () => {
    // Every floor point must be inside [near, far], or its shadow is clipped away.
    expect(range.near).toBeGreaterThan(0)
    expect(range.far).toBeGreaterThan(range.near)
    const d = studioKeyDirection()
    const yCam = d[1] * ORBIT_STUDIO.distance
    const spread = (Math.abs(d[0]) + Math.abs(d[2])) * 9.5
    expect(range.far).toBeGreaterThanOrEqual(yCam / d[1] + spread - 1e-9)
  })

  it('is far TIGHTER than the sun’s 1..59.5, which is the whole point', () => {
    // VSM reconstructs occlusion from depth variance, so its bound degrades as the
    // occluder→receiver separation shrinks relative to the camera’s depth RANGE.
    expect(range.far - range.near).toBeLessThan(20)
  })

  it('cannot separate ceiling from floor by depth — so a near plane is NOT the opt-out', () => {
    // The documented reason `STUDIO_KEY_SHADOW_TAG` exists: for a tilted key the
    // ceiling's depths and the floor's depths interleave.
    const d = studioKeyDirection()
    const spread = (Math.abs(d[0]) + Math.abs(d[2])) * 9.5
    const ceilingToFloor = 2.6 / d[1]
    expect(spread).toBeGreaterThan(ceilingToFloor)
  })
})

describe('the key and the fill ride the same day level', () => {
  it('are byte-neutral when the key is not live', () => {
    expect(orbitStudioFillScale(false, 1)).toBe(1)
    expect(orbitStudioFillScale(false, 0)).toBe(1)
  })

  it('pay full price at full day', () => {
    expect(orbitStudioKeyIntensity(1)).toBeCloseTo(ORBIT_STUDIO.intensity, 12)
    expect(orbitStudioFillScale(true, 1)).toBeCloseTo(ORBIT_STUDIO.fillScale, 12)
  })

  it('are BOTH neutral at night, so the night dollhouse is unchanged', () => {
    expect(orbitStudioKeyIntensity(0)).toBe(0)
    expect(orbitStudioFillScale(true, 0)).toBe(1)
  })

  it('meet in the middle rather than one leading the other', () => {
    expect(orbitStudioKeyIntensity(0.5)).toBeCloseTo(ORBIT_STUDIO.intensity * 0.5, 12)
    expect(orbitStudioFillScale(true, 0.5)).toBeCloseTo(1 + (ORBIT_STUDIO.fillScale - 1) * 0.5, 12)
  })

  it('clamps a nonsense day level instead of amplifying it', () => {
    expect(orbitStudioKeyIntensity(4)).toBeCloseTo(ORBIT_STUDIO.intensity, 12)
    expect(orbitStudioKeyIntensity(Number.NaN)).toBe(0)
    expect(orbitStudioFillScale(true, -2)).toBe(1)
    expect(orbitStudioFillScale(true, Number.NaN)).toBe(1)
  })

  it('takes the DEV sweep override in place of the constant, not of the ramp', () => {
    expect(orbitStudioFillScale(true, 1, 0.25)).toBeCloseTo(0.25, 12)
    expect(orbitStudioFillScale(true, 0, 0.25)).toBe(1)
    expect(orbitStudioKeyIntensity(1, 2.2)).toBeCloseTo(2.2, 12)
  })
})

describe('orbitStudioAo', () => {
  const walk = { radius: AO.aoRadiusPost, intensity: AO.intensityPost }

  it('returns the caller’s own values untouched when the key is not live', () => {
    expect(orbitStudioAo(false, walk, 1)).toEqual(walk)
    // AO-SMALL-ROOM's shipped point, which walk must keep byte-identical.
    expect(walk).toEqual({ radius: 0.7, intensity: 5 })
  })

  it('opens the kernel to metre scale at full day', () => {
    expect(orbitStudioAo(true, walk, 1)).toEqual(ORBIT_STUDIO.ao)
    expect(ORBIT_STUDIO.ao.radius).toBeGreaterThan(walk.radius)
    expect(ORBIT_STUDIO.ao.intensity).toBeGreaterThan(walk.intensity)
  })

  it('is byte-identical to walk’s values at night', () => {
    // A CONSTANT orbit AO took the 20:00 dollhouse mean 106.9 -> 96.1, re-basing
    // every number ORBIT-NIGHT-CAPS tuned the night frame against.
    expect(orbitStudioAo(true, walk, 0)).toEqual(walk)
  })

  it('interpolates monotonically between them', () => {
    const mid = orbitStudioAo(true, walk, 0.5)
    expect(mid.radius).toBeGreaterThan(walk.radius)
    expect(mid.radius).toBeLessThan(ORBIT_STUDIO.ao.radius)
    expect(mid.intensity).toBeCloseTo((walk.intensity + ORBIT_STUDIO.ao.intensity) / 2, 12)
  })
})

describe('the flag', () => {
  it('is registered, simple-tier and on by default', () => {
    const def = FEATURE_FLAGS.orbitStudioLook
    expect(def).toBeDefined()
    // Anything that changes the DEFAULT look must not sit behind a pro-tier flag
    // (`src/scene/CLAUDE.md`, SKY-ANALYTIC-ORBIT).
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
  })

  it('is on in BOTH ui modes', () => {
    expect(resolveFlags(false, {}, false, 'simple').orbitStudioLook).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').orbitStudioLook).toBe(true)
  })
})

/* ------------------------------------------------------------------ *
 * Source contracts — invisible to `tsc` and to every pure test above. *
 * ------------------------------------------------------------------ */

const read = (...p: string[]) => readFileSync(join(__dirname, ...p), 'utf8')
const strip = (s: string) => s.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

describe('mount contracts', () => {
  it('Lighting mounts the key only when `orbitStudioActive` says so', () => {
    const src = strip(read('lighting', 'Lighting.tsx'))
    expect(src).toContain('orbitStudioActive({')
    // The light is behind the resolved predicate, not behind an inline condition
    // that could drift from the tested one.
    expect(src).toMatch(/\{studioOn && \(\s*<directionalLight/)
  })

  it('only the main Scene opts in — the room editor never does', () => {
    for (const f of [
      'Lighting allowOrbitStudio',
      'Effects allowOrbitStudio',
      'SceneEnvironment allowOrbitStudio',
    ]) {
      expect(strip(read('Scene.tsx'))).toContain(`<${f} />`)
    }
    const editor = strip(read('RoomEditorScene.tsx'))
    expect(editor).not.toContain('allowOrbitStudio')
  })

  it('the fill compensation reaches BOTH halves of the positionless fill', () => {
    // Scaling only the analytical hemisphere + ambient moved the orbit frame mean
    // 181.9 -> 180.4 for a 60 % cut, i.e. nothing: the IBL probe is the larger half.
    expect(strip(read('lighting', 'Lighting.tsx'))).toContain('orbitStudioFillScale(')
    expect(strip(read('lighting', 'SceneEnvironment.tsx'))).toContain('orbitStudioFillScale(')
  })

  it('the occluder stands down for the tagged shadow camera and restores after', () => {
    const occ = strip(
      readFileSync(join(__dirname, '..', 'apartment', 'ceiling', 'CeilingOccluder.tsx'), 'utf8'),
    )
    expect(occ).toContain('onBeforeShadow={skipStudioKeyShadow}')
    expect(occ).toContain('onAfterShadow={restoreShadowWrites}')
    expect(occ).toContain(`shadowCamera.userData?.[STUDIO_KEY_SHADOW_TAG] === true`)
    // It must NOT bring its own depth material: that instance was the only part of
    // this change that reached WALK mode, where the occluder also casts.
    expect(occ).not.toContain('customDepthMaterial')
    // And it must still block the SUN, which is what ORBIT-CEILING is for.
    expect(occ).toContain('castShadow')
  })

  it('the shadow tag is a single shared constant, not a repeated string literal', () => {
    expect(STUDIO_KEY_SHADOW_TAG).toBe('orbitStudioKeyShadow')
    const lighting = strip(read('lighting', 'Lighting.tsx'))
    expect(lighting).toContain('STUDIO_KEY_SHADOW_TAG')
    expect(lighting).not.toContain("'orbitStudioKeyShadow'")
  })

  it('the key gets PERF-MAX-1’s frozen shadow map like the sun', () => {
    const src = strip(read('lighting', 'Lighting.tsx'))
    // Its direction is a CONSTANT, so its map cannot even change with the clock —
    // without the freeze it would re-render a 1024² map every orbit frame.
    expect(src).toContain('ks.autoUpdate = false')
    expect(src).toContain('lastStudioShadow')
  })
})
