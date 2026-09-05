/**
 * DOOR-HARDWARE — the ironmongery a real HDB door leaf carries, as pure geometry.
 *
 * Every position here is expressed in the **leaf's hinge-local frame**, the frame
 * `Door.tsx` (and `RoomShell.tsx`, which renders the same `DoorLeaf`) already uses for
 * the swing group: the group sits at `[hingeLocalX, 0, 0]` on the wall-aligned door
 * root, local **+X runs along the wall**, the leaf spans `x ∈ [0, direction·width]`
 * (`direction = hinge === 'start' ? 1 : -1`), local **Y is metres above the floor**
 * (NOT centred on the leaf), and local **Z is the wall normal** with the leaf body in
 * `z ∈ [−leafThick/2, +leafThick/2]`.
 *
 * Two frame facts drive everything below:
 *
 * - **The pivot is the leaf's own hinge edge at `x = 0, z = 0`.** three rotates a local
 *   `(x, 0, 0)` by `φ` about Y to `(x·cos φ, 0, −x·sin φ)`, and the swing group is driven
 *   with `rotation.y = swingSign·θ`, so the free edge travels toward
 *   `z = −direction·swingSign·|x|·sin θ`. Hence {@link swingSideZ}: the side the leaf
 *   opens into is `−direction · swingSign`, and it depends on the hinge jamb as well as
 *   the swing hand (`Door.tsx`'s security-gate comment states the `direction = 1` case of
 *   the same identity).
 * - **A hinge must not ride the leaf.** The knuckle is placed on the pivot's X (`x = 0`)
 *   and rendered in the door's STATIC group, so it stays put while the leaf swings —
 *   which is what a real butt hinge does. Only its LEAF plate rides the swing group
 *   (`rides: 'leaf'`); the knuckle and the jamb plate are static (`rides: 'jamb'`). The
 *   knuckle is pushed proud of the closed leaf's swing-side face (`knuckleZ`) because the
 *   app's simplified pivot is the leaf CENTRELINE, not the face corner a real pin sits on:
 *   left at `z = 0` the barrel would be entirely buried inside a 50 mm leaf and nothing
 *   would render at all.
 *
 * Dependency-free and unit-tested (`doorHardwareModel.test.ts`); the renderer adds
 * nothing but meshes and materials. Lathe/tube/box shapes only — there is no CC0 handle
 * or hinge model on Poly Haven (checked), and none of this needs a Blender/Cycles bake:
 * it is dimensioned from real ironmongery (a 100 mm butt hinge, a 19 mm lever tube on a
 * 45 × 90 mm rose, a 45 mm floor dome), not matched to a rendered look.
 */

export type Vec3 = [number, number, number]

/** Which door a leaf is, for hardware purposes. `main` = the entrance leaf (the one that
 *  carries the HDB security gate): it additionally gets a digital lock and a kick plate. */
export type DoorHardwareKind = 'main' | 'flush' | 'glazed' | 'panel' | 'bifold' | 'blast'

export interface DoorHardwareSpec {
  /** Leaf width in metres (a bifold's two half-leaves still declare the full opening). */
  width: number
  /** Leaf height in metres (floor → head). */
  height: number
  /** Leaf thickness in metres. */
  leafThick: number
  hinge: 'start' | 'end'
  swing: 'left' | 'right'
  kind: DoorHardwareKind
}

// ── Butt hinges ──────────────────────────────────────────────────────────────
/** 100 mm butt hinge (the SG standard for a 35–45 kg leaf). */
export const HINGE_LEAF_LEN_M = 0.1
/** Ø 14 mm knuckle. */
export const HINGE_KNUCKLE_R_M = 0.007
/** 2 mm plates. */
export const HINGE_PLATE_T_M = 0.002
/** Plate reach from the knuckle axis, onto the leaf and onto the jamb. */
export const HINGE_PLATE_W_M = 0.03
/** Top and bottom hinges sit this far in from head and floor; the third splits the leaf. */
export const HINGE_INSET_M = 0.2

// ── Lever set ────────────────────────────────────────────────────────────────
/** Rose plate (unchanged from the pre-DOOR-HARDWARE handle). */
export const ROSE_SIZE_M: Vec3 = [0.045, 0.09, 0.006]
/** Handle centre: this far in from the leaf's FREE (latch) edge. */
export const HANDLE_EDGE_INSET_M = 0.08
/** Handle centre height as a fraction of leaf height (~0.88 m on a 2.1 m leaf). */
export const HANDLE_HEIGHT_FRAC = 0.42
/** Ø 18 mm lever tube. */
export const LEVER_TUBE_R_M = 0.009
/** How far the lever stands off the rose face before it turns. */
export const LEVER_OUT_M = 0.028
/** Length of the 90° return, back along the leaf toward the hinge. */
export const LEVER_RETURN_M = 0.11
/** Drop of the lever's free end below the rose centre (the usual slight downward set). */
export const LEVER_DROP_M = 0.008
/** Escutcheon plate for the privacy turn / lock cylinder. */
export const ESCUTCHEON_SIZE_M: Vec3 = [0.045, 0.045, 0.004]
/** Ø 22 mm × 10 mm cylinder. */
export const CYLINDER_R_M = 0.011
export const CYLINDER_LEN_M = 0.01
/** Cylinder centre below the rose centre. */
export const CYLINDER_DROP_M = 0.075

// ── Main-door extras ─────────────────────────────────────────────────────────
/** Digital lock body (interior face). */
export const LOCK_BODY_SIZE_M: Vec3 = [0.07, 0.16, 0.025]
/** Lock body centre above the handle centre. */
export const LOCK_ABOVE_M = 0.2
/** Keypad inset on the lock body's outer face (width × height). */
export const KEYPAD_SIZE_M: [number, number] = [0.045, 0.07]
/** Kick plate (exterior face, bottom). */
export const KICK_PLATE_H_M = 0.2
export const KICK_PLATE_T_M = 0.0015

// ── Floor stopper ────────────────────────────────────────────────────────────
/** Ø 45 mm dome. */
export const STOPPER_R_M = 0.0225
export const STOPPER_H_M = 0.04
/** Dark rubber tip on the dome's leaf-facing top. */
export const STOPPER_TIP_H_M = 0.012
/** The open angle the stopper catches the leaf at. */
export const STOPPER_ANGLE_RAD = (85 * Math.PI) / 180
/** Pulled this far back along the leaf, toward the hinge, from the free edge. */
export const STOPPER_BACK_M = 0.05

/** Brushed stainless, shared by every metal part here. */
export const HARDWARE_METAL = { color: '#c9ccd1', metalness: 0.75, roughness: 0.3 } as const
/** Satin dark grey — the digital lock body. */
export const LOCK_BODY_COLOR = '#3a3d42'
/** Gloss black — the keypad. */
export const KEYPAD_COLOR = '#141517'
/** Matte black rubber — the stopper tip. */
export const RUBBER_COLOR = '#2a2a2c'

/** One part of one butt hinge. `rides: 'leaf'` must be rendered inside the SWING group;
 *  `rides: 'jamb'` inside the door's static group (see the module note). */
interface DoorHingePart {
  kind: 'knuckle' | 'plate'
  rides: 'leaf' | 'jamb'
  position: Vec3
}

export interface DoorHinge {
  /** Knuckle centre height above the floor. */
  y: number
  parts: DoorHingePart[]
}

/** The lever/rose/cylinder assembly on ONE face of the leaf. */
export interface DoorLeverFace {
  /** +1 = the leaf's +Z face, −1 = its −Z face. */
  face: 1 | -1
  /** Rose plate centre (its 6 mm depth is centred here, half-sunk against the leaf). */
  rose: Vec3
  /** Lever centreline, swept as a tube of {@link LEVER_TUBE_R_M}: rose face → out →
   *  90° return along the leaf, dropping {@link LEVER_DROP_M} over the return. */
  lever: Vec3[]
  /** Centre of the lever's rounded end cap (== the last polyline point). */
  leverEnd: Vec3
  escutcheon: Vec3
  cylinder: Vec3
}

interface DoorLockBody {
  /** Body centre, on the INTERIOR face. */
  position: Vec3
  /** Keypad plate centre, proud of the body's outer face. */
  keypad: Vec3
  /** Outward normal sign along Z (which face the body stands on). */
  face: 1 | -1
}

interface DoorKickPlate {
  /** Plate centre, on the EXTERIOR face. */
  position: Vec3
  width: number
  face: 1 | -1
}

export interface DoorStopper {
  /** Dome base centre, ON THE FLOOR (`y = 0`), in the hinge-local frame. */
  position: Vec3
  /** Rubber tip centre. */
  tip: Vec3
}

export interface DoorHardware {
  /** `hinge === 'start' ? 1 : -1` — the leaf extends along `direction · X`. */
  direction: 1 | -1
  /** The Z side the leaf opens into: `−direction · swingSign`. */
  swingSideZ: 1 | -1
  hinges: DoorHinge[]
  /** Two faces (`+1`, `−1`) for flush/glazed/main leaves; empty otherwise (a panel leaf
   *  keeps its knob, a bifold its recessed pull, the blast door its bolts). */
  lever: DoorLeverFace[]
  /** Main door only. */
  lock: DoorLockBody | null
  /** Main door only. */
  kickPlate: DoorKickPlate | null
  /** Every SWING door; `null` for the bifold and the household-shelter blast door. */
  stopper: DoorStopper | null
}

/** Doors whose leaf carries the lever set (the others keep their existing handle). */
function hasLever(kind: DoorHardwareKind): boolean {
  return kind === 'main' || kind === 'flush' || kind === 'glazed'
}

/**
 * Butt hinges on the leaf's hinge edge, at 0.20 m, mid-height and `height − 0.20 m`.
 *
 * The knuckle sits on the pivot's X (`x = 0`) so the swing never moves it, and proud of
 * the swing-side face in Z so it is not buried in the leaf (module note). Its plates
 * reach {@link HINGE_PLATE_W_M} onto the leaf and onto the jamb from that axis.
 */
export function doorHinges(spec: DoorHardwareSpec): DoorHinge[] {
  const direction: 1 | -1 = spec.hinge === 'start' ? 1 : -1
  const swingSign: 1 | -1 = spec.swing === 'left' ? 1 : -1
  const swingSideZ = (-direction * swingSign) as 1 | -1
  // Barrel TANGENT to the swing-side face (centre a full radius proud of it), so the
  // whole Ø 14 mm knuckle reads from the room. Measured the hard way: sunk 2 mm INTO a
  // 50 mm leaf, only a 5 mm sliver cleared the face and the hinge was invisible in
  // every real-GPU frame — at the grazing angle you actually look along a door edge,
  // the leaf's own face occluded it. It still sits well inside the 50 mm reveal of a
  // 100 mm wall, so it never pokes through the jamb.
  const knuckleZ = swingSideZ * (spec.leafThick / 2 + HINGE_KNUCKLE_R_M)
  // The plates lie FLAT on the leaf face and the jamb face, under the barrel.
  const plateZ = swingSideZ * (spec.leafThick / 2 + HINGE_PLATE_T_M / 2)
  const plateReach = HINGE_KNUCKLE_R_M + HINGE_PLATE_W_M / 2
  const ys = [HINGE_INSET_M, spec.height / 2, spec.height - HINGE_INSET_M]
  return ys.map((y) => ({
    y,
    parts: [
      { kind: 'knuckle', rides: 'jamb', position: [0, y, knuckleZ] },
      { kind: 'plate', rides: 'leaf', position: [direction * plateReach, y, plateZ] },
      { kind: 'plate', rides: 'jamb', position: [-direction * plateReach, y, plateZ] },
    ] as DoorHingePart[],
  }))
}

/** The lever + privacy-turn set on both faces (flush / glazed / main leaves only). */
export function doorLever(spec: DoorHardwareSpec): DoorLeverFace[] {
  if (!hasLever(spec.kind)) return []
  const direction: 1 | -1 = spec.hinge === 'start' ? 1 : -1
  const hx = direction * (spec.width - HANDLE_EDGE_INSET_M)
  const hy = spec.height * HANDLE_HEIGHT_FRAC
  const faceZ = spec.leafThick / 2 + 0.002
  return ([1, -1] as const).map((face) => {
    const z0 = face * faceZ
    const zOut = face * (faceZ + LEVER_OUT_M)
    // Rose face → straight out → 90° return back along the leaf toward the hinge, the
    // free end dropping LEVER_DROP_M. The mid point rounds the corner when the renderer
    // sweeps a Catmull-Rom through it (a real lever's neck is never a mitre).
    const lever: Vec3[] = [
      [hx, hy, z0],
      [hx, hy, zOut],
      [hx - direction * (LEVER_RETURN_M / 2), hy - LEVER_DROP_M / 2, zOut],
      [hx - direction * LEVER_RETURN_M, hy - LEVER_DROP_M, zOut],
    ]
    return {
      face,
      rose: [hx, hy, z0],
      lever,
      leverEnd: lever[lever.length - 1],
      escutcheon: [hx, hy - CYLINDER_DROP_M, z0],
      cylinder: [hx, hy - CYLINDER_DROP_M, face * (faceZ + ESCUTCHEON_SIZE_M[2] / 2)],
    }
  })
}

/**
 * The floor stopper: where the leaf's free edge lands at 85° open, pulled
 * {@link STOPPER_BACK_M} back toward the hinge along the leaf so the dome catches the
 * leaf's FACE rather than its corner. Computed from `direction`/`swingSign`, so it always
 * lands on the swing side of the wall.
 */
export function doorStopper(spec: DoorHardwareSpec): DoorStopper | null {
  // A bifold folds flat against its own jamb and the shelter's blast door swings into a
  // 1.5 m² store — neither has floor to spare, and a dome in the wrong metre reads far
  // worse than no dome at all.
  if (spec.kind === 'bifold' || spec.kind === 'blast') return null
  const direction: 1 | -1 = spec.hinge === 'start' ? 1 : -1
  const swingSign: 1 | -1 = spec.swing === 'left' ? 1 : -1
  const r = Math.max(0.1, spec.width - STOPPER_BACK_M)
  const phi = swingSign * STOPPER_ANGLE_RAD
  const x = direction * r * Math.cos(phi)
  const z = -direction * r * Math.sin(phi)
  return {
    position: [x, 0, z],
    tip: [x, STOPPER_H_M - STOPPER_TIP_H_M / 2, z],
  }
}

/** Resolve every hardware part for one leaf. */
export function doorHardware(spec: DoorHardwareSpec): DoorHardware {
  const direction: 1 | -1 = spec.hinge === 'start' ? 1 : -1
  const swingSign: 1 | -1 = spec.swing === 'left' ? 1 : -1
  const swingSideZ = (-direction * swingSign) as 1 | -1
  const isMain = spec.kind === 'main'
  const hx = direction * (spec.width - HANDLE_EDGE_INSET_M)
  const hy = spec.height * HANDLE_HEIGHT_FRAC
  // The leaf opens INTO the room (`swingSideZ`, the side the security gate is NOT on), so
  // that face is the interior one: digital lock inside, kick plate outside.
  const interior = swingSideZ
  const lockZ = interior * (spec.leafThick / 2 + LOCK_BODY_SIZE_M[2] / 2)
  const lock: DoorLockBody | null = isMain
    ? {
        position: [hx, hy + LOCK_ABOVE_M, lockZ],
        keypad: [hx, hy + LOCK_ABOVE_M, lockZ + interior * (LOCK_BODY_SIZE_M[2] / 2 + 0.0015)],
        face: interior,
      }
    : null
  const kickPlate: DoorKickPlate | null = isMain
    ? {
        position: [
          (direction * spec.width) / 2,
          KICK_PLATE_H_M / 2,
          -interior * (spec.leafThick / 2 + KICK_PLATE_T_M / 2),
        ],
        width: spec.width,
        face: -interior as 1 | -1,
      }
    : null
  return {
    direction,
    swingSideZ,
    hinges: doorHinges(spec),
    lever: doorLever(spec),
    lock,
    kickPlate,
    stopper: doorStopper(spec),
  }
}
