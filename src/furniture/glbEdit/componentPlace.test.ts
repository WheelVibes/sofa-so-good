import { describe, expect, it } from 'vitest'
import { componentTransform, mountAxis, placeComponentOnFace } from './componentPlace'
import { componentById } from './components'
import {
  type AssetEditSpec,
  addPart,
  createEmptySpec,
  partGroups,
  repeatComponentGroup,
  updatePart,
} from './editSpec'

/** A spec with a single tabletop box centred at the origin (2 m × 0.05 × 1 m,
 *  underside at y = 0). The symmetry frame + underside plane both derive from it. */
function tableTop(): AssetEditSpec {
  let s = createEmptySpec()
  s = addPart(s, 'box')
  const id = s.parts[0].id
  s = updatePart(s, id, { size: [2, 0.05, 1], position: [0, 0.025, 0] })
  return s
}

describe('mountAxis', () => {
  it('floor fittings align their DOWN axis, wall fittings their OUT axis', () => {
    expect(mountAxis('floor')).toEqual([0, -1, 0])
    expect(mountAxis('wall')).toEqual([0, 0, 1])
  })
})

describe('componentTransform', () => {
  it('floor mount on a table UNDERSIDE (normal down) is identity — the leg hangs straight down', () => {
    const t = componentTransform('floor', { point: [0.8, 0, 0.35], normal: [0, -1, 0] })
    expect(t.rotation).toBeUndefined()
    expect(t.position).toEqual([0.8, 0, 0.35])
  })

  it('floor mount on a TOP face (normal up) flips 180° so the fitting stands up', () => {
    const t = componentTransform('floor', { point: [0, 0.5, 0], normal: [0, 1, 0] })
    expect(t.rotation).toBeDefined()
    // A 180° flip about a horizontal axis — the down axis now points up.
    const [rx, , rz] = t.rotation as [number, number, number]
    expect(Math.abs(rx) === 180 || Math.abs(rz) === 180).toBe(true)
  })

  it('wall mount on a +Z face is identity (bar horizontal, protruding +Z)', () => {
    const t = componentTransform('wall', { point: [0, 0.3, 0.5], normal: [0, 0, 1] })
    expect(t.rotation).toBeUndefined()
  })

  it('wall mount on a +X face rotates about the VERTICAL axis (bar stays horizontal)', () => {
    const t = componentTransform('wall', { point: [0.5, 0.3, 0], normal: [1, 0, 0] })
    const [rx, ry, rz] = t.rotation as [number, number, number]
    // Only the Y (vertical) component is non-zero → horizontality preserved.
    expect(rx).toBe(0)
    expect(rz).toBe(0)
    expect(Math.abs(ry)).toBe(90)
  })

  it('snaps the hit point to 5 mm', () => {
    const t = componentTransform('floor', { point: [0.8123, 0, 0.3467], normal: [0, -1, 0] })
    expect(t.position).toEqual([0.81, 0, 0.345])
  })

  it('a degenerate (zero) normal falls back to up rather than NaN', () => {
    const t = componentTransform('floor', { point: [0, 0, 0], normal: [0, 0, 0] })
    for (const v of t.position) expect(Number.isFinite(v)).toBe(true)
    if (t.rotation) for (const v of t.rotation) expect(Number.isFinite(v)).toBe(true)
  })
})

describe('placeComponentOnFace', () => {
  it('lands a leg as a named PartGroup with the mount transform + all its parts', () => {
    const def = componentById('leg-tapered-round')!
    const { spec, groupId } = placeComponentOnFace(
      tableTop(),
      def,
      {},
      {
        point: [0.8, 0, 0.35],
        normal: [0, -1, 0],
      },
    )
    expect(groupId).toBeTruthy()
    const g = partGroups(spec).find((x) => x.id === groupId)!
    expect(g.name).toBe('Tapered leg')
    expect(g.position).toEqual([0.8, 0, 0.35])
    // The built parts are appended and all belong to the new group.
    expect(g.partIds.length).toBe(spec.parts.length - 1) // (minus the tabletop)
    for (const id of g.partIds) expect(spec.parts.some((p) => p.id === id)).toBe(true)
  })

  it('places a bar pull on a vertical face with the long axis horizontal', () => {
    const def = componentById('handle-bar-pull')!
    const { spec, groupId } = placeComponentOnFace(
      createEmptySpec(),
      def,
      {},
      {
        point: [0, 0.4, 0.5],
        normal: [0, 0, 1],
      },
    )
    const g = partGroups(spec).find((x) => x.id === groupId)!
    expect(g.rotation).toBeUndefined() // identity → bar's local X stays world X (horizontal)
  })
})

describe('repeatComponentGroup (symmetric placement)', () => {
  /** Place one leg near the +X/+Z corner of the tabletop, then repeat. */
  function placedCorner() {
    const def = componentById('leg-tapered-round')!
    return placeComponentOnFace(
      tableTop(),
      def,
      {},
      {
        point: [0.9, 0, 0.4],
        normal: [0, -1, 0],
      },
    )
  }

  it('mirror-x reflects across the asset centre X (0) → the opposite side', () => {
    const { spec, groupId } = placedCorner()
    const { spec: out, groupIds } = repeatComponentGroup(spec, groupId!, 'mirror-x')
    expect(groupIds.length).toBe(1)
    const copy = partGroups(out).find((g) => g.id === groupIds[0])!
    expect(copy.position).toEqual([-0.9, 0, 0.4])
  })

  it('mirror-z reflects across the asset centre Z (0)', () => {
    const { spec, groupId } = placedCorner()
    const { spec: out, groupIds } = repeatComponentGroup(spec, groupId!, 'mirror-z')
    const copy = partGroups(out).find((g) => g.id === groupIds[0])!
    expect(copy.position).toEqual([0.9, 0, -0.4])
  })

  it('quad produces the 3 other corners (4 legs total), each a deep copy', () => {
    const { spec, groupId } = placedCorner()
    const before = spec.parts.length
    const perLeg = partGroups(spec).find((g) => g.id === groupId)!.partIds.length
    const { spec: out, groupIds } = repeatComponentGroup(spec, groupId!, 'quad')
    expect(groupIds.length).toBe(3)
    // 4 leg groups total.
    const legGroups = partGroups(out).filter((g) => g.name === 'Tapered leg')
    expect(legGroups.length).toBe(4)
    const corners = legGroups
      .map((g) => g.position ?? [0, 0, 0])
      .map(([x, , z]) => `${x},${z}`)
      .sort()
    expect(corners).toEqual(['-0.9,-0.4', '-0.9,0.4', '0.9,-0.4', '0.9,0.4'].sort())
    // Deep copies: 3 new groups × perLeg parts appended, no id reuse.
    expect(out.parts.length).toBe(before + 3 * perLeg)
    expect(new Set(out.parts.map((p) => p.id)).size).toBe(out.parts.length)
  })

  it('is a no-op for an unknown group id', () => {
    const { spec } = placedCorner()
    const { spec: out, groupIds } = repeatComponentGroup(spec, 'nope', 'quad')
    expect(groupIds).toEqual([])
    expect(out).toBe(spec)
  })
})
