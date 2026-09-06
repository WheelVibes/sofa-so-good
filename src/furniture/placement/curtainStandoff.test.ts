import { describe, expect, it } from 'vitest'
import { windowInteriorProjection, windowSillProjection } from '../../apartment/windowProjection'
import { curtainFoldZ } from '../primitives/Curtain'
import {
  CURTAIN_CLEARANCE,
  CURTAIN_FOLD_DEPTH,
  CURTAIN_FOLD_PEAK,
  CURTAIN_MIN_FACE_GAP,
  CURTAIN_PANEL_BASE_Z,
  CURTAIN_ROD_MAX_DROP,
  CURTAIN_ROD_OBSTACLE_CLEARANCE,
  CURTAIN_ROD_TOP_OFFSET,
  type CurtainObstacleBox,
  curtainFaceGap,
  curtainRodHeight,
  curtainStandoff,
  curtainTroughDepth,
} from './curtainStandoff'

const EXTERNAL = 0.2
const INTERNAL = 0.1

describe('CURTAIN_FOLD_PEAK', () => {
  it('bounds the real fold profile (and is not slack)', () => {
    let min = 0
    for (let i = 0; i <= 2000; i++) {
      const x = -0.5 + i / 2000
      for (let j = 0; j <= 400; j++) {
        min = Math.min(min, curtainFoldZ(x, (2.55 * j) / 400, 2.55))
      }
    }
    const bound = CURTAIN_FOLD_DEPTH * CURTAIN_FOLD_PEAK
    expect(-min).toBeLessThanOrEqual(bound)
    // Conservative, but by less than 1 mm — a slack bound would push every
    // curtain needlessly far off the wall.
    expect(bound + min).toBeLessThan(0.001)
  })
})

describe('curtainStandoff', () => {
  it('clears the sill of a 0.2 m external wall by exactly the stated margin', () => {
    const sill = windowSillProjection(EXTERNAL)
    expect(sill).toBeCloseTo(0.04, 6)
    const standoff = curtainStandoff({
      wallThickness: EXTERNAL,
      sillProjection: windowInteriorProjection(EXTERNAL),
    })
    const gap = curtainFaceGap(standoff, EXTERNAL)
    // Panel plane 0.142 off the face; the deepest OPEN fold trough then stops
    // CURTAIN_CLEARANCE in front of the sill nose.
    expect(gap).toBeCloseTo(0.142, 3)
    expect(gap - curtainTroughDepth() - sill).toBeCloseTo(CURTAIN_CLEARANCE, 3)
    // …and well clear of the bare wall face.
    expect(gap - curtainTroughDepth()).toBeGreaterThan(0)
  })

  it('stands further off a thinner wall, because its sill projects further', () => {
    const thin = curtainStandoff({
      wallThickness: INTERNAL,
      sillProjection: windowInteriorProjection(INTERNAL),
    })
    const thick = curtainStandoff({
      wallThickness: EXTERNAL,
      sillProjection: windowInteriorProjection(EXTERNAL),
    })
    expect(windowSillProjection(INTERNAL)).toBeCloseTo(0.09, 6)
    expect(curtainFaceGap(thin, INTERNAL)).toBeCloseTo(0.192, 3)
    // Same sill ledge, less wall around it → the fabric has to stand off more.
    expect(curtainFaceGap(thin, INTERNAL)).toBeGreaterThan(curtainFaceGap(thick, EXTERNAL))
  })

  it('honours a plan thickness override (a 0.3 m RC wall)', () => {
    const t = 0.3
    // The whole window assembly is buried inside a 0.3 m wall, so nothing
    // projects and only the fabric's own fold depth governs.
    expect(windowInteriorProjection(t)).toBe(0)
    const standoff = curtainStandoff({
      wallThickness: t,
      sillProjection: windowInteriorProjection(t),
    })
    const gap = curtainFaceGap(standoff, t)
    expect(gap).toBeCloseTo(curtainTroughDepth() + CURTAIN_CLEARANCE, 3)
    expect(gap).toBeGreaterThanOrEqual(CURTAIN_MIN_FACE_GAP)
    // The standoff itself still grows with the wall — the snap plants the item
    // on the CENTRE-line, which moves out with the thickness.
    expect(standoff).toBeCloseTo(t / 2 + gap - CURTAIN_PANEL_BASE_Z, 3)
  })

  it('floors at the minimum face gap when the fabric is shallow', () => {
    // A hypothetical flat sheet (no folds) still stands off the face — a rod on
    // real brackets is never truly flush.
    const standoff = curtainStandoff({
      wallThickness: EXTERNAL,
      sillProjection: 0,
      foldDepth: 0,
    })
    expect(curtainFaceGap(standoff, EXTERNAL)).toBeCloseTo(CURTAIN_MIN_FACE_GAP, 6)
  })

  it('never returns a negative or NaN standoff for degenerate input', () => {
    expect(curtainStandoff({ wallThickness: 0, sillProjection: 0 })).toBeCloseTo(0.052, 6)
    expect(curtainStandoff({ wallThickness: -1, sillProjection: -1 })).toBeCloseTo(0.052, 6)
  })
})

describe('curtainRodHeight', () => {
  const standoff = curtainStandoff({
    wallThickness: EXTERNAL,
    sillProjection: windowInteriorProjection(EXTERNAL),
  })
  /** A 0.84 x 0.30 aircon fan-coil mounted at 2.25 m, centred over the window,
   *  0.21 m deep off the wall — the default flat's living-room unit. */
  const aircon: CurtainObstacleBox = { x: [-0.42, 0.42], y: [2.1, 2.4], z: [0.155, 0.365] }

  it('keeps the preferred height when nothing is mounted over the window', () => {
    expect(curtainRodHeight({ preferredHeight: 2.55, width: 2.7, standoff, obstacles: [] })).toBe(
      2.55,
    )
  })

  it('ducks the rod under an aircon over the window', () => {
    const h = curtainRodHeight({
      preferredHeight: 2.55,
      width: 2.7,
      standoff,
      obstacles: [aircon],
    })
    expect(h + CURTAIN_ROD_TOP_OFFSET).toBeCloseTo(2.1 - CURTAIN_ROD_OBSTACLE_CLEARANCE, 6)
    expect(h).toBeLessThan(2.55)
  })

  it('ignores an obstacle the curtain misses along the wall', () => {
    const aside: CurtainObstacleBox = { ...aircon, x: [2.0, 2.9] }
    expect(
      curtainRodHeight({ preferredHeight: 2.55, width: 2.7, standoff, obstacles: [aside] }),
    ).toBe(2.55)
  })

  it('ignores an obstacle the fabric passes behind/in front of in Z', () => {
    const deep: CurtainObstacleBox = { ...aircon, z: [0.6, 0.9] }
    expect(
      curtainRodHeight({ preferredHeight: 2.55, width: 2.7, standoff, obstacles: [deep] }),
    ).toBe(2.55)
  })

  it('ignores a mid-wall mount rather than hanging a knee-high curtain', () => {
    // A reading sconce at 1.45 m overlaps the drape, but ducking under it would
    // cost more than CURTAIN_ROD_MAX_DROP — see that constant.
    const sconce: CurtainObstacleBox = { x: [-0.1, 0.1], y: [1.35, 1.55], z: [0.1, 0.48] }
    expect(2.55 - (1.35 - CURTAIN_ROD_OBSTACLE_CLEARANCE - CURTAIN_ROD_TOP_OFFSET)).toBeGreaterThan(
      CURTAIN_ROD_MAX_DROP,
    )
    expect(
      curtainRodHeight({ preferredHeight: 2.55, width: 2.7, standoff, obstacles: [sconce] }),
    ).toBe(2.55)
  })

  it('takes the LOWEST demand when two obstacles both foul the drape', () => {
    const lower: CurtainObstacleBox = { ...aircon, y: [2.0, 2.3] }
    const h = curtainRodHeight({
      preferredHeight: 2.55,
      width: 2.7,
      standoff,
      obstacles: [aircon, lower],
    })
    expect(h + CURTAIN_ROD_TOP_OFFSET).toBeCloseTo(2.0 - CURTAIN_ROD_OBSTACLE_CLEARANCE, 6)
  })
})
