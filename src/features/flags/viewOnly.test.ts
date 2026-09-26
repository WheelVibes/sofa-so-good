import { describe, expect, it } from 'vitest'
import { FEATURE_FLAG_KEYS, FEATURE_FLAGS, resolveFlags } from '../featureFlags'
import type { FeatureFlag } from './types'
import {
  isBlockedInViewOnly,
  VIEW_ONLY_BLOCKED_FLAGS,
  VIEW_ONLY_DELIBERATE_EXCEPTIONS,
} from './viewOnly'

/**
 * Sentinels for the two directions the showroom denylist can rot in.
 *
 * `VIEW_ONLY_BLOCKED_FLAGS` is enumerated, not derived (see the module's doc
 * comment for why a denylist beats an allowlist here), so these pin the cases
 * that would hurt: an authoring surface leaking into a visitor's session, and a
 * rendering/experience flag being swept up and quietly degrading the tour.
 */
const MUST_BE_BLOCKED: FeatureFlag[] = [
  'floorPlanEditor',
  'planReset',
  'modelUpload',
  'smartStart',
  'materialComposer',
  'finishRecolor',
  'contextMenu',
  'history',
  'comments',
  'furnitureGroups',
  'parametricFurniture',
  'catalogFavourites',
  'aiLayout',
  'styleTransfer',
  'masterPalette',
  'ceilingDesign',
  'mepEditor',
  'glbDesigner',
]

/** The showroom IS these. If any of them ever lands on the denylist the tour
 *  stops being worth taking, so they are asserted explicitly. */
const MUST_STAY_LIVE: FeatureFlag[] = [
  // The render itself — roughly half the registry is fidelity, and withholding
  // any of it would hand a visitor a worse-looking flat than the owner sees.
  'visibilityLightmap',
  'daylightHourCurve',
  'bakedGiDayLevel',
  'weatherConditions',
  'weatherSky',
  'windowBlowout',
  'pbrSurfaces',
  'photorealModels',
  'estateSurround',
  'contactShadows',
  'proceduralSky',
  'hdriEnvironment',
  // Camera, quality and the experience.
  'walkthrough',
  'walkCameraControls',
  'walkLights',
  'walkWindowFixtures',
  'walkScreens',
  'cabinetOpen',
  'minimapTeleport',
  // Orientation, not authoring: a visitor on the tour needs to know which room
  // they are looking at as much as the owner does (C4).
  'orbitRoomReadout',
  'walkRoomReadout',
  'savedViews',
  'presentation',
  'panorama',
  'panoTour',
  'hqRender',
  'colorGrade',
  'renderPresets',
  'lightMoodPresets',
  'backdrops',
  'twoPointPerspective',
  'parallelProjection',
  'frameSelection',
  // Re-sharing, and the analysis a visitor may legitimately want.
  'shareExport',
  'viewOnlyShare',
  'shareCard',
  'budget',
  'measure',
  'report',
]

describe('VIEW_ONLY_BLOCKED_FLAGS', () => {
  it('lists only real, unique registry keys', () => {
    for (const flag of VIEW_ONLY_BLOCKED_FLAGS) expect(FEATURE_FLAGS[flag]).toBeDefined()
    expect(new Set(VIEW_ONLY_BLOCKED_FLAGS).size).toBe(VIEW_ONLY_BLOCKED_FLAGS.length)
  })

  it('withholds every authoring surface', () => {
    for (const flag of MUST_BE_BLOCKED) expect(isBlockedInViewOnly(flag)).toBe(true)
  })

  it('never withholds a rendering, camera, quality or sharing flag', () => {
    for (const flag of MUST_STAY_LIVE) expect(isBlockedInViewOnly(flag)).toBe(false)
  })

  it('leaves the majority of the registry untouched (it is a denylist, not a kill switch)', () => {
    expect(VIEW_ONLY_BLOCKED_FLAGS.length).toBeLessThan(FEATURE_FLAG_KEYS.length / 2)
  })
})

describe('denylist-rot guard — every AI surface is classified', () => {
  // `aiPhotoreal` sat on NEITHER side for a whole round: the denylist's "unclassified stays on"
  // default made it live in a showroom without anyone having decided that (R7-O, R7-W). This
  // makes the classification explicit and forces the next `ai*` flag to be filed one way or the
  // other — blocked, or named in the exception map with a reason.
  const AI_FLAGS = FEATURE_FLAG_KEYS.filter((k) => /^ai[A-Z]/.test(k))
  const exceptions = Object.keys(VIEW_ONLY_DELIBERATE_EXCEPTIONS) as FeatureFlag[]

  it('finds the AI surfaces it is guarding (so a rename cannot make it vacuous)', () => {
    expect(AI_FLAGS.length).toBeGreaterThanOrEqual(5)
    expect(AI_FLAGS).toContain('aiPhotoreal')
  })

  it('files every ai* flag as blocked XOR a named, reasoned exception', () => {
    for (const flag of AI_FLAGS) {
      const blocked = isBlockedInViewOnly(flag)
      const excepted = VIEW_ONLY_DELIBERATE_EXCEPTIONS[flag] !== undefined
      expect({ flag, classified: blocked !== excepted }).toEqual({ flag, classified: true })
    }
  })

  it('lists only real, unblocked registry keys as exceptions, each with a reason', () => {
    for (const flag of exceptions) {
      expect(FEATURE_FLAGS[flag]).toBeDefined()
      expect(isBlockedInViewOnly(flag)).toBe(false)
      expect((VIEW_ONLY_DELIBERATE_EXCEPTIONS[flag] ?? '').length).toBeGreaterThan(40)
    }
  })

  it('names aiPhotoreal as a deliberate owner decision, not an open question', () => {
    const reason = VIEW_ONLY_DELIBERATE_EXCEPTIONS.aiPhotoreal ?? ''
    expect(reason).toMatch(/Owner decision \(2026-09-26\)/)
    expect(reason).toMatch(/export/i)
    expect(reason).toMatch(/API key/)
    expect(reason).not.toMatch(/debatable/i)
  })

  it('withholds every AI surface that changes the design', () => {
    for (const flag of ['aiWalls', 'aiPlanGenerate', 'aiDesignChat', 'aiLayout'] as FeatureFlag[]) {
      expect(isBlockedInViewOnly(flag)).toBe(true)
    }
  })
})

describe('resolveFlags — showroom (view-only) dimension', () => {
  // Privileged (dev) so devOnly/override branches aren't what's under test.
  const pro = resolveFlags(true, {}, false, 'pro')
  const proShowroom = resolveFlags(true, {}, false, 'pro', true)
  const simple = resolveFlags(true, {}, false, 'simple')
  const simpleShowroom = resolveFlags(true, {}, false, 'simple', true)

  it('is a no-op when viewOnly is false (the default)', () => {
    expect(resolveFlags(true, {}, false, 'pro', false)).toEqual(pro)
  })

  it('forces every blocked flag off in Pro mode', () => {
    for (const flag of VIEW_ONLY_BLOCKED_FLAGS) expect(proShowroom[flag]).toBe(false)
  })

  it('forces every blocked flag off in Simple mode too (CLAUDE.md: test BOTH modes)', () => {
    for (const flag of VIEW_ONLY_BLOCKED_FLAGS) expect(simpleShowroom[flag]).toBe(false)
  })

  it('changes nothing else — an unblocked flag resolves identically in both modes', () => {
    for (const key of FEATURE_FLAG_KEYS) {
      if (isBlockedInViewOnly(key)) continue
      expect(proShowroom[key]).toBe(pro[key])
      expect(simpleShowroom[key]).toBe(simple[key])
    }
  })

  it('wins over a dev/admin override, like the Simple branch does', () => {
    // `floorPlanEditor` is on by default; force it on explicitly and it still goes.
    const forced = resolveFlags(true, { floorPlanEditor: true }, true, 'pro', true)
    expect(forced.floorPlanEditor).toBe(false)
  })

  it('keeps aiPhotoreal exactly as an ordinary session has it, in BOTH modes', () => {
    // The 2026-09-26 decision is "no behaviour change": a Pro-mode visitor has the export (it is
    // on by default), and Simple mode hides it the same way it does for the owner (pro tier).
    expect(proShowroom.aiPhotoreal).toBe(pro.aiPhotoreal)
    expect(proShowroom.aiPhotoreal).toBe(true)
    expect(simpleShowroom.aiPhotoreal).toBe(simple.aiPhotoreal)
    expect(simpleShowroom.aiPhotoreal).toBe(false)
  })

  it('leaves the showroom-link feature itself enabled, so a visitor can re-share', () => {
    expect(proShowroom.viewOnlyShare).toBe(true)
    expect(simpleShowroom.viewOnlyShare).toBe(true)
    expect(proShowroom.shareExport).toBe(true)
    expect(simpleShowroom.shareExport).toBe(true)
  })
})
