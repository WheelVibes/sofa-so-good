import { describe, expect, it } from 'vitest'
import { defaultPart, type PartGroup, type ShapePart, updatePart } from './editSpec'
import {
  GIZMO_MODES,
  type GizmoSnapshot,
  GROUP_GIZMO_MODES,
  gizmoModesFor,
  gizmoPatch,
  groupGizmoPatch,
  mergeEngagedSnap,
  normalizeDeg,
  snapValue,
} from './gizmoWriteBack'

const box = (over: Partial<ShapePart> = {}): ShapePart => ({
  ...defaultPart('box'),
  position: [0, 0.2, 0],
  size: [0.4, 0.4, 0.4],
  ...over,
})

const meshPart = (): ShapePart => ({
  ...box(),
  kind: 'mesh',
  geometry: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], normals: [0, 0, 1, 0, 0, 1, 0, 0, 1] },
})

const snap = (over: Partial<GizmoSnapshot> = {}): GizmoSnapshot => ({
  position: [0, 0.2, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
  ...over,
})

describe('snapValue', () => {
  it('rounds to the step without float dust', () => {
    expect(snapValue(0.1234, 0.005)).toBe(0.125)
    expect(snapValue(0.30000000000000004, 0.005)).toBe(0.3)
  })
  it('never returns -0', () => {
    expect(Object.is(snapValue(-0.001, 0.005), 0)).toBe(true)
  })
})

describe('normalizeDeg', () => {
  it('wraps into [-180, 180)', () => {
    expect(normalizeDeg(190)).toBe(-170)
    expect(normalizeDeg(-190)).toBe(170)
    expect(normalizeDeg(360)).toBe(0)
    expect(normalizeDeg(180)).toBe(-180)
  })
})

describe('gizmoModesFor', () => {
  it('primitives get all three modes', () => {
    expect(gizmoModesFor('box')).toEqual(['translate', 'rotate', 'scale'])
  })
  it('mesh (CSG result) parts hide scale — geometry is baked', () => {
    expect(gizmoModesFor('mesh')).toEqual(['translate', 'rotate'])
  })
  it('every mode has a segmented-control entry with a hotkey', () => {
    expect(GIZMO_MODES.map((m) => m.mode)).toEqual(['translate', 'rotate', 'scale'])
    for (const m of GIZMO_MODES) expect(m.hotkey).toMatch(/^[grs]$/)
  })
})

describe('gizmoPatch translate', () => {
  it('snaps the dragged position to 5 mm', () => {
    const p = gizmoPatch(box(), 'translate', snap({ position: [0.1234, 0.4999, -0.0024] }))
    expect(p).toEqual({ position: [0.125, 0.5, 0] })
  })
  it('clamps to the numeric inputs’ ±3 m range', () => {
    const p = gizmoPatch(box(), 'translate', snap({ position: [9, 0.2, -9] }))
    expect(p).toEqual({ position: [3, 0.2, -3] })
  })
  it('returns null when the snapped position is unchanged (no spec churn)', () => {
    expect(gizmoPatch(box(), 'translate', snap({ position: [0.0001, 0.2001, 0] }))).toBeNull()
  })
  it('mesh parts translate like any other', () => {
    const p = gizmoPatch(meshPart(), 'translate', snap({ position: [0.5, 0.2, 0] }))
    expect(p).toEqual({ position: [0.5, 0.2, 0] })
  })
})

describe('gizmoPatch rotate', () => {
  it('converts radians to whole degrees', () => {
    const p = gizmoPatch(box(), 'rotate', snap({ rotation: [0, Math.PI / 2, 0] }))
    expect(p).toEqual({ rotation: [0, 90, 0] })
  })
  it('snaps to 1° and normalises beyond ±180°', () => {
    const p = gizmoPatch(box(), 'rotate', snap({ rotation: [0.011, (190 * Math.PI) / 180, 0] }))
    expect(p).toEqual({ rotation: [1, -170, 0] })
  })
  it('an all-zero result clears the rotation field (absent = none)', () => {
    const p = gizmoPatch(box({ rotation: [0, 45, 0] }), 'rotate', snap())
    expect(p).toEqual({ rotation: undefined })
  })
  it('returns null when nothing changed (part without rotation, identity drag)', () => {
    expect(gizmoPatch(box(), 'rotate', snap({ rotation: [0.001, 0, 0] }))).toBeNull()
  })
})

describe('gizmoPatch scale', () => {
  it('multiplies size per axis and snaps to 5 mm', () => {
    const p = gizmoPatch(box(), 'scale', snap({ scale: [2, 1, 0.5] }))
    expect(p).toEqual({ size: [0.8, 0.4, 0.2] })
  })
  it('clamps each axis to the 0.02 m minimum', () => {
    const p = gizmoPatch(box(), 'scale', snap({ scale: [0.01, 1, 1] }))
    expect(p).toEqual({ size: [0.02, 0.4, 0.4] })
  })
  it('returns null for a mesh part — its triangles are baked, no size to drive', () => {
    expect(gizmoPatch(meshPart(), 'scale', snap({ scale: [2, 2, 2] }))).toBeNull()
  })
  it('returns null for a ~unit scale (no spec churn)', () => {
    expect(gizmoPatch(box(), 'scale', snap({ scale: [1.001, 1, 0.999] }))).toBeNull()
  })
})

describe('gizmoPatch scale — radially-symmetric kinds (lathe/sweep) drive off the dragged axis', () => {
  // default lathe size = [0.12, 0.5, 0.12] (diameter, height, _).
  const lathe = (over: Partial<ShapePart> = {}): ShapePart => ({ ...defaultPart('lathe'), ...over })

  it('an X-only drag mirrors X onto Z (stays round)', () => {
    const p = gizmoPatch(lathe(), 'scale', snap({ scale: [2, 1, 1] }))
    expect(p).toEqual({ size: [0.24, 0.5, 0.24] })
  })

  it('a Z-only drag drives the diameter off Z (no longer a no-op / null)', () => {
    const p = gizmoPatch(lathe(), 'scale', snap({ scale: [1, 1, 2] }))
    expect(p).toEqual({ size: [0.24, 0.5, 0.24] })
  })

  it('a uniform drag scales diameter + height together', () => {
    const p = gizmoPatch(lathe(), 'scale', snap({ scale: [2, 2, 2] }))
    expect(p).toEqual({ size: [0.24, 1, 0.24] })
  })

  it('a Y-only drag changes only height, keeping the diameter round', () => {
    const p = gizmoPatch(lathe(), 'scale', snap({ scale: [1, 2, 1] }))
    expect(p).toEqual({ size: [0.12, 1, 0.12] })
  })
})

describe('round-trip through updatePart (the numeric inputs’ path)', () => {
  it('the patch lands on the part exactly like typing the numbers', () => {
    const part = box()
    const spec = { sourceScale: 1, parts: [part], meshOverrides: {} }
    const patch = gizmoPatch(part, 'translate', snap({ position: [0.1234, 0.75, -1] }))
    expect(patch).not.toBeNull()
    const next = updatePart(spec, part.id, patch ?? {})
    expect(next.parts[0].position).toEqual([0.125, 0.75, -1])
    expect(next.parts[0].id).toBe(part.id)
  })
})

describe('groupGizmoPatch — transform-group gizmo write-back (Stage 3a)', () => {
  const group = (over: Partial<PartGroup> = {}): PartGroup => ({
    id: 'g',
    name: 'Group 1',
    partIds: ['a', 'b'],
    ...over,
  })

  it('GROUP_GIZMO_MODES excludes scale (a group has no size)', () => {
    expect(GROUP_GIZMO_MODES.map((m) => m.mode)).toEqual(['translate', 'rotate'])
  })

  it('translate → snapped, clamped position patch', () => {
    const patch = groupGizmoPatch(group(), 'translate', snap({ position: [0.1234, 0, 5] }))
    expect(patch).toEqual({ position: [0.125, 0, 3] }) // 5 clamped to +3m
  })

  it('rotate → snapped, normalised rotation patch', () => {
    const patch = groupGizmoPatch(group(), 'rotate', snap({ rotation: [0, Math.PI / 2, 0] }))
    expect(patch).toEqual({ rotation: [0, 90, 0] })
  })

  it('returns null when the drag lands on the current transform (no churn)', () => {
    const g = group({ position: [0.5, 0, 0] })
    expect(groupGizmoPatch(g, 'translate', snap({ position: [0.5, 0, 0] }))).toBeNull()
  })

  it('scale mode falls back to a position patch (no group scaling)', () => {
    const patch = groupGizmoPatch(
      group(),
      'scale',
      snap({ position: [0.5, 0, 0], scale: [2, 2, 2] }),
    )
    expect(patch).toEqual({ position: [0.5, 0, 0] })
  })
})

describe('gizmoPatch — custom snap step (Stage 4 grid snap)', () => {
  it('snaps position to a 1 cm step', () => {
    const p = gizmoPatch(box(), 'translate', snap({ position: [0.123, 0.2, 0] }), 0.01)
    expect(p).toEqual({ position: [0.12, 0.2, 0] })
  })

  it('snaps position to a 5 cm step', () => {
    const p = gizmoPatch(box(), 'translate', snap({ position: [0.17, 0.2, 0] }), 0.05)
    expect(p).toEqual({ position: [0.15, 0.2, 0] })
  })

  it('a fine step (snap off) keeps a mid-grid drag', () => {
    const p = gizmoPatch(box(), 'translate', snap({ position: [0.123, 0.2, 0] }), 0.001)
    expect(p).toEqual({ position: [0.123, 0.2, 0] })
  })

  it('defaults to 5 mm when no step is given (back-compat)', () => {
    const p = gizmoPatch(box(), 'translate', snap({ position: [0.123, 0.2, 0] }))
    expect(p).toEqual({ position: [0.125, 0.2, 0] })
  })

  it('snaps a group drag to the custom step too', () => {
    const g: PartGroup = { id: 'g', name: 'G', partIds: ['a'] }
    const patch = groupGizmoPatch(g, 'translate', snap({ position: [0.17, 0, 0] }), 0.05)
    expect(patch).toEqual({ position: [0.15, 0, 0] })
  })
})

describe('mergeEngagedSnap — live face-snap wins over grid quantisation (finding 1)', () => {
  it('takes the flush value VERBATIM on an engaged axis, skipping the coarse grid', () => {
    // A live drag showed the mover flush at x=0.1 (its +X face abutting a wall);
    // the commit grid-snapped that to 0.15 at a 5 cm step (gridPos). The engaged X
    // axis must win → committed x = the live flush 0.1, not the 0.15 grid value.
    const gridPos: [number, number, number] = [0.15, 0.2, 0]
    const flush: [number, number, number] = [0.1, 0.2, 0]
    const merged = mergeEngagedSnap(gridPos, flush, { x: true, y: false, z: false })
    expect(merged).toEqual([0.1, 0.2, 0])
  })

  it('keeps the grid-snapped value on a NON-engaged axis', () => {
    const gridPos: [number, number, number] = [0.15, 0.35, 0.15]
    const flush: [number, number, number] = [0.1, 0.271, 0.083]
    // Only X snapped flush; Y/Z stay on the grid.
    const merged = mergeEngagedSnap(gridPos, flush, { x: true, y: false, z: false })
    expect(merged).toEqual([0.1, 0.35, 0.15])
  })

  it('honours the flush value at ANY grid step (fine 1 mm and coarse 5 cm agree)', () => {
    const flush: [number, number, number] = [0.1, 0.2, 0]
    // Whatever the grid rounded X to, an engaged X commits the flush value — so
    // the committed value equals the live-shown flush regardless of step.
    for (const gridX of [0.1, 0.125, 0.15, 0.0]) {
      const merged = mergeEngagedSnap([gridX, 0.2, 0], flush, { x: true, y: false, z: false })
      expect(merged[0]).toBe(0.1)
    }
  })

  it('all axes engaged → the whole flush position wins (group path)', () => {
    const gridPos: [number, number, number] = [0.15, 0.15, 0.15]
    const flush: [number, number, number] = [0.083, 0.271, 0.019]
    const merged = mergeEngagedSnap(gridPos, flush, { x: true, y: true, z: true })
    expect(merged).toEqual(flush)
  })
})
