import { describe, expect, it } from 'vitest'
import { windowInteriorProjection } from '../../apartment/windowProjection'
import { resolveFlags } from '../../features/featureFlags'
import { buildDefaultPlan } from '../../floorplan/defaultPlan'
import { planWallThickness } from '../../floorplan/planGeometry'
import { defaultLayout } from '../defaultLayout'
import {
  CURTAIN_ROD_OBSTACLE_CLEARANCE,
  CURTAIN_ROD_TOP_OFFSET,
  curtainFaceGap,
  curtainStandoff,
  curtainTroughDepth,
} from '../placement/curtainStandoff'
import { snapToNearestWindow } from '../placement/windowSnap'
import { applyCurtainFlush, curtainObstacles } from './curtainFlush'

const plan = buildDefaultPlan()
const curtains = () => defaultLayout().filter((i) => i.defId === 'curtains')

describe('CURTAIN-FLUSH seeded layout', () => {
  it('seeds all four default curtains', () => {
    expect(
      curtains()
        .map((c) => c.id)
        .sort(),
    ).toEqual([
      'default-b2-curtain',
      'default-b3-curtain',
      'default-ld-curtain',
      'default-main-curtain',
    ])
  })

  it('puts every curtain on its host wall CENTRE-line within 1 mm', () => {
    for (const c of curtains()) {
      const snap = snapToNearestWindow(plan.walls, plan.openings, c.position, plan)
      expect(snap, c.id).not.toBeNull()
      if (!snap) continue
      expect(
        Math.hypot(c.position[0] - snap.position[0], c.position[1] - snap.position[1]),
      ).toBeLessThan(0.001)
      // …and facing the room, which for the flat's north windows is +Z.
      expect(c.rotation).toBeCloseTo(snap.rotation, 6)
    }
  })

  it('carries the derived, face-relative standoff for its host wall', () => {
    for (const c of curtains()) {
      const snap = snapToNearestWindow(plan.walls, plan.openings, c.position, plan)
      if (!snap) throw new Error(`${c.id} does not snap`)
      const t = snap.wallThickness
      expect(c.props.standoff).toBeCloseTo(
        curtainStandoff({ wallThickness: t, sillProjection: windowInteriorProjection(t) }),
        6,
      )
      // All four sit on the flat's 0.2 m external walls: 0.142 m of panel plane
      // off the face, so the deepest OPEN fold trough clears the sill nose.
      expect(t).toBeCloseTo(0.2, 6)
      const gap = curtainFaceGap(c.props.standoff as number, t)
      expect(gap).toBeCloseTo(0.142, 3)
      expect(gap - curtainTroughDepth()).toBeGreaterThan(windowInteriorProjection(t))
    }
  })

  it('ducks the living-room rod under the aircon, and leaves the bedrooms alone', () => {
    const items = defaultLayout()
    const ld = items.find((i) => i.id === 'default-ld-curtain')
    if (!ld) throw new Error('no living/dining curtain')
    // The aircon is the one mount that overlaps the drape in BOTH x and z.
    const halfSpan = (ld.props.width as number) / 2 + 0.1
    const plane = 0.05 + (ld.props.standoff as number)
    const fouling = curtainObstacles(ld, items).filter(
      (o) =>
        o.x[0] < halfSpan &&
        -halfSpan < o.x[1] &&
        o.z[0] < plane + curtainTroughDepth() &&
        plane - curtainTroughDepth() < o.z[1],
    )
    expect(fouling).toHaveLength(1)
    const under = fouling[0].y[0]
    expect(under).toBeCloseTo(2.1, 6) // aircon body 2.10–2.40 (mountHeight 2.25, h 0.30)
    expect((ld.props.height as number) + CURTAIN_ROD_TOP_OFFSET).toBeLessThanOrEqual(
      under - CURTAIN_ROD_OBSTACLE_CLEARANCE + 1e-9,
    )
    // The bedrooms have nothing over their windows, so they keep the authored drop.
    for (const id of ['default-main-curtain', 'default-b2-curtain', 'default-b3-curtain']) {
      expect(items.find((i) => i.id === id)?.props.height, id).toBe(2.55)
    }
  })

  it('preserves every authored prop it does not own', () => {
    const main = curtains().find((c) => c.id === 'default-main-curtain')
    // CURTAIN-NIGHTSTAND's 1.9 width and WINDOW-TIME-INVARIANT's open default.
    expect(main?.props.width).toBe(1.9)
    expect(main?.props.drawAmount).toBe(0)
    expect(main?.props.color).toBe('#c8bca8')
  })

  it('is flag-gated, and re-seats the item when the flag is on', () => {
    // Off: the pass early-returns the input array untouched (asserted through
    // `resolveFlags`, since `applyCurtainFlush` reads the live resolved flags).
    expect(resolveFlags(true, { curtainFlush: false }, false, 'simple').curtainFlush).toBe(false)
    expect(resolveFlags(false, {}, false, 'simple').curtainFlush).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').curtainFlush).toBe(true)
    const seeded = [
      {
        id: 'x',
        defId: 'curtains' as const,
        position: [1.7, 0.28] as [number, number],
        rotation: 0,
        props: { standoff: 0.2, height: 2.55 },
      },
    ]
    const on = applyCurtainFlush(seeded)
    expect(on[0].position[1]).toBeCloseTo(0.1, 6)
    expect(on[0].props.standoff).not.toBe(0.2)
  })

  it('resolves a plan thickness override through planWallThickness', () => {
    const wall = plan.walls.find((w) => w.id === 'wall-ext-N-west')
    expect(wall && planWallThickness(wall, plan)).toBeCloseTo(0.2, 6)
  })
})
