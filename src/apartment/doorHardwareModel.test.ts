import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DOORS, FLAT } from './constants'
import {
  CYLINDER_DROP_M,
  type DoorHardwareKind,
  type DoorHardwareSpec,
  doorHardware,
  doorHinges,
  doorLever,
  doorStopper,
  HANDLE_EDGE_INSET_M,
  HANDLE_HEIGHT_FRAC,
  HINGE_INSET_M,
  HINGE_KNUCKLE_R_M,
  KICK_PLATE_H_M,
  LEVER_DROP_M,
  LEVER_OUT_M,
  LEVER_RETURN_M,
  LOCK_ABOVE_M,
  STOPPER_ANGLE_RAD,
  STOPPER_BACK_M,
} from './doorHardwareModel'

const base: DoorHardwareSpec = {
  width: 0.85,
  height: FLAT.doorHeight,
  leafThick: FLAT.doorThickness,
  hinge: 'start',
  swing: 'right',
  kind: 'flush',
}
const spec = (over: Partial<DoorHardwareSpec>): DoorHardwareSpec => ({ ...base, ...over })
const finite = (v: number[]) => v.every((n) => Number.isFinite(n))

describe('doorHinges — three butt hinges on the hinge edge', () => {
  it('places them at 0.20 m, mid-height and height − 0.20 m', () => {
    const hs = doorHinges(base)
    expect(hs.map((h) => h.y)).toEqual([
      HINGE_INSET_M,
      FLAT.doorHeight / 2,
      FLAT.doorHeight - HINGE_INSET_M,
    ])
  })

  it('puts the knuckle ON the pivot X so the swing never moves it', () => {
    for (const h of doorHinges(base)) {
      const knuckle = h.parts.find((p) => p.kind === 'knuckle')!
      expect(knuckle.position[0]).toBe(0)
      expect(knuckle.rides).toBe('jamb')
    }
  })

  it('stands the knuckle proud of the swing-side face, not buried in the leaf', () => {
    const right = doorHinges(spec({ hinge: 'start', swing: 'right' }))[0]
    const left = doorHinges(spec({ hinge: 'start', swing: 'left' }))[0]
    const zr = right.parts[0].position[2]
    const zl = left.parts[0].position[2]
    // swingSideZ = −direction·swingSign: +1 for start/right, −1 for start/left.
    expect(Math.sign(zr)).toBe(1)
    expect(Math.sign(zl)).toBe(-1)
    // Tangent to the face: the whole barrel clears the leaf, none of it is buried.
    expect(Math.abs(zr)).toBeCloseTo(FLAT.doorThickness / 2 + HINGE_KNUCKLE_R_M, 9)
    expect(Math.abs(zr) - HINGE_KNUCKLE_R_M).toBeGreaterThanOrEqual(FLAT.doorThickness / 2 - 1e-9)
    // …and still inside the reveal of the 100 mm wall it hangs in.
    expect(Math.abs(zr) + HINGE_KNUCKLE_R_M).toBeLessThan(FLAT.internalWallThickness / 2)
  })

  it('reaches its plates onto the LEAF side for hinge:start and hinge:end alike', () => {
    for (const [hinge, dir] of [
      ['start', 1],
      ['end', -1],
    ] as const) {
      const h = doorHinges(spec({ hinge }))[1]
      const leafPlate = h.parts.find((p) => p.rides === 'leaf')!
      const jambPlate = h.parts.find((p) => p.kind === 'plate' && p.rides === 'jamb')!
      // The leaf spans x ∈ [0, direction·width]; its plate must sit on that side, the
      // jamb's on the other.
      expect(Math.sign(leafPlate.position[0])).toBe(dir)
      expect(Math.sign(jambPlate.position[0])).toBe(-dir)
      expect(Math.abs(leafPlate.position[0])).toBeLessThan(base.width)
    }
  })

  it('gives every door in the default flat three hinges, blast and bifold included', () => {
    for (const d of DOORS) {
      const hs = doorHinges(spec({ width: d.width, hinge: d.hinge, swing: d.swing }))
      expect(hs).toHaveLength(3)
      expect(hs.every((h) => h.parts.every((p) => finite(p.position)))).toBe(true)
    }
  })
})

describe('doorLever — the returned lever, rose, escutcheon and cylinder', () => {
  it('is built for flush / glazed / main leaves and for nothing else', () => {
    const on: DoorHardwareKind[] = ['flush', 'glazed', 'main']
    const off: DoorHardwareKind[] = ['panel', 'bifold', 'blast']
    for (const kind of on) expect(doorLever(spec({ kind }))).toHaveLength(2)
    for (const kind of off) expect(doorLever(spec({ kind }))).toHaveLength(0)
  })

  it('sits on both faces, at the latch edge, at handle height', () => {
    const faces = doorLever(base)
    expect(faces.map((f) => f.face)).toEqual([1, -1])
    for (const f of faces) {
      expect(f.rose[0]).toBeCloseTo(base.width - HANDLE_EDGE_INSET_M, 9)
      expect(f.rose[1]).toBeCloseTo(base.height * HANDLE_HEIGHT_FRAC, 9)
      expect(Math.sign(f.rose[2])).toBe(f.face)
      expect(Math.abs(f.rose[2])).toBeGreaterThan(base.leafThick / 2)
    }
  })

  it('turns 90° out of the face and returns along the leaf with a slight drop', () => {
    for (const hinge of ['start', 'end'] as const) {
      const dir = hinge === 'start' ? 1 : -1
      const [front] = doorLever(spec({ hinge }))
      const pts = front.lever
      expect(pts).toHaveLength(4)
      expect(pts.every(finite)).toBe(true)
      // 1. straight out of the face, same x/y.
      expect(pts[1][0]).toBeCloseTo(pts[0][0], 9)
      expect(pts[1][1]).toBeCloseTo(pts[0][1], 9)
      expect(Math.abs(pts[1][2] - pts[0][2])).toBeCloseTo(LEVER_OUT_M, 9)
      // 2. the return runs BACK along the leaf (toward the hinge at x = 0) at constant z.
      const end = pts[3]
      expect(end[2]).toBeCloseTo(pts[1][2], 9)
      expect(end[0] - pts[1][0]).toBeCloseTo(-dir * LEVER_RETURN_M, 9)
      expect(Math.abs(end[0])).toBeLessThan(Math.abs(pts[0][0]))
      // 3. the free end drops, and only by the authored amount.
      expect(pts[0][1] - end[1]).toBeCloseTo(LEVER_DROP_M, 9)
      expect(front.leverEnd).toEqual(end)
      // 4. total swept length is the out-leg plus the return (within the drop).
      let len = 0
      for (let i = 1; i < pts.length; i++) {
        len += Math.hypot(
          pts[i][0] - pts[i - 1][0],
          pts[i][1] - pts[i - 1][1],
          pts[i][2] - pts[i - 1][2],
        )
      }
      expect(len).toBeGreaterThan(LEVER_OUT_M + LEVER_RETURN_M - 0.001)
      expect(len).toBeLessThan(LEVER_OUT_M + LEVER_RETURN_M + LEVER_DROP_M + 0.001)
    }
  })

  it('drops the privacy turn 75 mm below the rose, proud of its escutcheon', () => {
    for (const f of doorLever(base)) {
      expect(f.rose[1] - f.escutcheon[1]).toBeCloseTo(CYLINDER_DROP_M, 9)
      expect(f.escutcheon[0]).toBeCloseTo(f.rose[0], 9)
      expect(f.cylinder[1]).toBeCloseTo(f.escutcheon[1], 9)
      expect(Math.abs(f.cylinder[2])).toBeGreaterThan(Math.abs(f.escutcheon[2]))
    }
  })
})

describe('doorStopper — on the floor, on the swing side', () => {
  const combos = [
    { hinge: 'start', swing: 'right' },
    { hinge: 'start', swing: 'left' },
    { hinge: 'end', swing: 'right' },
    { hinge: 'end', swing: 'left' },
  ] as const

  it('lands on the side the leaf actually swings to, for all four combinations', () => {
    for (const c of combos) {
      const dir = c.hinge === 'start' ? 1 : -1
      const sign = c.swing === 'left' ? 1 : -1
      const swingSideZ = -dir * sign
      const st = doorStopper(spec(c))!
      expect(st).not.toBeNull()
      expect(Math.sign(st.position[2])).toBe(swingSideZ)
      // Matches the leaf's own rotation: the free edge at 85°, pulled back 50 mm.
      const r = base.width - STOPPER_BACK_M
      expect(st.position[0]).toBeCloseTo(dir * r * Math.cos(sign * STOPPER_ANGLE_RAD), 9)
      expect(Math.abs(st.position[2])).toBeCloseTo(r * Math.sin(STOPPER_ANGLE_RAD), 9)
      // Almost fully open: the dome sits nearly square off the wall, close to the leaf.
      expect(Math.abs(st.position[0])).toBeLessThan(0.1)
      expect(st.position[1]).toBe(0)
      expect(finite(st.position)).toBe(true)
      expect(finite(st.tip)).toBe(true)
      expect(st.tip[1]).toBeGreaterThan(0)
    }
  })

  it('is omitted for the bifold and the blast door, present for every swing door', () => {
    expect(doorStopper(spec({ kind: 'bifold' }))).toBeNull()
    expect(doorStopper(spec({ kind: 'blast' }))).toBeNull()
    for (const kind of ['main', 'flush', 'glazed', 'panel'] as DoorHardwareKind[]) {
      expect(doorStopper(spec({ kind }))).not.toBeNull()
    }
  })
})

describe('doorHardware — the main door’s extras', () => {
  it('gives ONLY the main door a digital lock and a kick plate', () => {
    for (const kind of ['flush', 'glazed', 'panel', 'bifold', 'blast'] as DoorHardwareKind[]) {
      const hw = doorHardware(spec({ kind }))
      expect(hw.lock).toBeNull()
      expect(hw.kickPlate).toBeNull()
    }
    const main = doorHardware(spec({ kind: 'main' }))
    expect(main.lock).not.toBeNull()
    expect(main.kickPlate).not.toBeNull()
  })

  it('puts the lock inside (the swing side) above the lever, and the kick plate outside', () => {
    const hw = doorHardware(spec({ kind: 'main' }))
    const lock = hw.lock!
    const kick = hw.kickPlate!
    // The leaf swings into the room, so the swing side is the interior face — the same
    // identity `Door.tsx` mounts the security gate on the opposite of.
    expect(lock.face).toBe(hw.swingSideZ)
    expect(kick.face).toBe(-hw.swingSideZ)
    expect(Math.sign(lock.position[2])).toBe(hw.swingSideZ)
    expect(Math.sign(kick.position[2])).toBe(-hw.swingSideZ)
    expect(lock.position[1]).toBeCloseTo(base.height * HANDLE_HEIGHT_FRAC + LOCK_ABOVE_M, 9)
    expect(lock.position[0]).toBeCloseTo(hw.lever[0].rose[0], 9)
    // The keypad stands proud of the body's own outer face.
    expect(Math.abs(lock.keypad[2])).toBeGreaterThan(Math.abs(lock.position[2]))
    // Kick plate: full leaf width, bottom of the leaf.
    expect(kick.width).toBeCloseTo(base.width, 9)
    expect(kick.position[1]).toBeCloseTo(KICK_PLATE_H_M / 2, 9)
    expect(kick.position[0]).toBeCloseTo(base.width / 2, 9)
  })

  it('resolves every door of the default flat without a NaN', () => {
    for (const d of DOORS) {
      const hw = doorHardware(
        spec({ width: d.width, hinge: d.hinge, swing: d.swing, kind: d.gate ? 'main' : 'flush' }),
      )
      expect(hw.hinges).toHaveLength(3)
      expect(hw.stopper && finite(hw.stopper.position)).toBe(true)
      for (const f of hw.lever) expect(f.lever.every(finite)).toBe(true)
    }
  })
})

describe('DOOR-HARDWARE renderer contract', () => {
  const door = readFileSync(join(__dirname, 'Door.tsx'), 'utf8')
  const parts = readFileSync(join(__dirname, 'DoorHardware.tsx'), 'utf8')

  it('is gated on the doorHardware flag, so the flag OFF renders today’s door exactly', () => {
    expect(door).toContain("useFeature('doorHardware')")
    // Every new branch hangs off the same `hardwareOn` gate — nothing else changed.
    expect(door).toContain('{hardwareOn ? <DoorHardwareLeafParts hw={hw} /> : null}')
    expect(door).toContain('<DoorHardwareStaticParts hw={hw} />')
    expect(door.match(/hardwareOn \?/g)).toHaveLength(3)
    // The pre-existing handles are untouched.
    expect(door).toContain('Classic knob (panel door)')
    expect(door).toContain('Recessed pull')
  })

  it('marks the hardware as a wall overlay so it hides while the wall fades', () => {
    expect(parts.match(/userData=\{markWallOverlay\(\)\}/g)).toHaveLength(2)
  })

  it('names its meshes so a scene probe can count them', () => {
    for (const n of [
      'door-hinge',
      'door-lever',
      'door-rose',
      'door-escutcheon',
      'door-cylinder',
      'door-lock',
      'door-kickplate',
      'door-stopper',
    ]) {
      expect(parts).toContain(`name="${n}"`)
    }
  })

  it('renders through the SAME component the room editor uses (EDITOR-LOCKSTEP)', () => {
    // The default flat's room editor draws its doors with `RoomShell.tsx` → `DoorLeaf`,
    // the very component patched here — so the editor gets the hardware for free.
    const shell = readFileSync(join(__dirname, 'RoomShell.tsx'), 'utf8')
    expect(shell).toContain("import { DoorLeaf } from './Door'")
    expect(shell).toContain('<DoorLeaf key={d.id} spec={d} />')
  })
})
