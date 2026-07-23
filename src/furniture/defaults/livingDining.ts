import { CURTAIN_SILL_STANDOFF } from '../placement/windowSnap'
import type { LayoutEntry } from './types'

/** Living / Dining — main rect [8.265,1.30]→[12.525,6.775], BUT the strip
 *  x<9.225 overlaps bedroom3 (z<3.775) and the corridor (z=[3.825,4.825]) —
 *  usable floor is x≥9.225 for z=[1.30,4.875], and the FULL width
 *  x=[8.265,12.525] for z=[4.875,6.775]. Entrance-foyer extension
 *  [9.73,6.775]→[12.525,8.185]; main door on the south step wall
 *  (z=8.185 face) x=[10.925,11.925], swinging inward.
 *
 *  Windows: north wall glass x=[9.595,12.045] (sill 0.95); the east wall is
 *  SOLID (no glazing on the plan). Solid (TV-capable) walls: the B3/LD
 *  partition x=9.225 face (z=[1.3,3.775]), the household-shelter east wall
 *  x=8.265 face (z=[4.925,6.775]), and the east wall itself.
 *
 *  TV console + wall TV back onto the west (B3/LD) partition, facing east;
 *  the sofa sits on the east side facing west, its back toward the solid
 *  east wall. Dining table sits in the south full-width zone, near
 *  the kitchen's open boundary. Shoe cabinet + plant live in the entrance
 *  foyer, east of the main door's swing zone. */
export const livingDining: LayoutEntry[] = [
  // TV console backed on the west (windowless) partition, facing east.
  // Nudged east 0.125 m (v0.23.1.8): the console's z-span [1.55,3.35] dips
  // into `wall-int-b3-LD-col`'s stretch (z=[1.2,1.8]), which thickened to
  // 300 mm RC — the wall's LD-side face there moved 9.225 → 9.325, past the
  // console's old west edge (9.275). (A flush +0.1 nudge cleared the wall
  // but pushed the console's east-side gap to `default-ld-coffee` from a
  // comfortable 0.5 m down to 0.4 m — the walkway checker's "impassable
  // pinch" cutoff; +0.125 keeps that gap a hair under 0.4 m instead, which
  // the checker treats as intentional close spacing, same as the shelf/
  // console pinch on the wall's OTHER side, see `bedroom3.ts`.)
  {
    id: 'default-ld-tv-console',
    defId: 'tv-console',
    position: [9.6, 2.45],
    rotation: Math.PI / 2,
    props: { width: 1.8 },
  },
  // Wall-mounted TV above the console, same wall, facing east — mounted
  // (wall-clip-exempt), so it just tracks the console's position, not its
  // own wall-clearance requirement.
  {
    id: 'default-ld-tv',
    defId: 'tv-wall',
    position: [9.425, 2.45],
    rotation: Math.PI / 2,
    props: { size: '65', mount: 'wall', mountHeight: 1.3, screen: 'on' },
  },
  // Sofa on the east side, facing the TV across the room, back toward the
  // solid east wall.
  {
    id: 'default-ld-sofa',
    defId: 'sofa-3seat',
    position: [11.675, 2.55],
    rotation: -Math.PI / 2,
    props: {},
  },
  {
    id: 'default-ld-dining-table',
    defId: 'dining-table-4',
    position: [11.0, 5.8],
    rotation: 0,
    props: { seats: '4' },
  },
  // Dining chairs — two per long side of the 1.4 m table.
  {
    id: 'default-ld-chair-n1',
    defId: 'dining-chair',
    position: [10.65, 5.05],
    rotation: 0,
    props: {},
  },
  {
    id: 'default-ld-chair-n2',
    defId: 'dining-chair',
    position: [11.35, 5.05],
    rotation: 0,
    props: {},
  },
  {
    id: 'default-ld-chair-s1',
    defId: 'dining-chair',
    position: [10.65, 6.55],
    rotation: Math.PI,
    props: {},
  },
  {
    id: 'default-ld-chair-s2',
    defId: 'dining-chair',
    position: [11.35, 6.55],
    rotation: Math.PI,
    props: {},
  },
  // Lounge zone between the TV console and the sofa. Coffee table rotated so
  // its long side runs parallel to the (north-south) sofa.
  {
    id: 'default-ld-rug',
    defId: 'rug',
    position: [10.575, 2.55],
    rotation: 0,
    props: { width: 2.0, depth: 1.8 },
  },
  {
    id: 'default-ld-coffee',
    defId: 'coffee-table',
    position: [10.45, 2.55],
    rotation: Math.PI / 2,
    props: {},
  },
  {
    id: 'default-ld-decor',
    defId: 'tabletop-decor',
    position: [10.45, 2.55],
    rotation: 0.3,
    props: { surfaceHeight: 0.42 },
  },
  // (Entrance foyer kept clear of the main door swing — only a flush shoe
  // cabinet + a corner plant live here, both east/west of the swing zone.)
  {
    id: 'default-ld-plant',
    defId: 'potted-plant',
    position: [10.1, 7.8],
    rotation: 0,
    props: { size: 'large', type: 'snake' },
  },
  // West side, clear of the TV console and south of the b3/corridor
  // restriction.
  { id: 'default-ld-lamp', defId: 'floor-lamp', position: [9.5, 4.5], rotation: 0, props: {} },
  // Ottoman at the foot of the sofa — pairs with the 3-seater as a
  // sofa+ottoman lounge (RM4), a footstool within reach of the seating.
  {
    id: 'default-ld-ottoman',
    defId: 'ottoman',
    position: [11.675, 4.0],
    rotation: 0,
    props: {
      shape: 'round',
      width: 0.7,
      depth: 0.7,
      color: '#9b8f7e',
      material: 'fabric',
      tufting: 'buttons',
    },
  },
  { id: 'default-ld-fan', defId: 'ceiling-fan', position: [10.575, 2.55], rotation: 0, props: {} },
  {
    id: 'default-ld-pendant-dining',
    defId: 'ceiling-light',
    position: [11.0, 5.8],
    rotation: 0,
    props: { style: 'pendant' },
  },
  { id: 'default-ld-aircon', defId: 'aircon-unit', position: [10.8, 1.46], rotation: 0, props: {} },
  // Wall art on the (solid) east wall, south of the sofa.
  {
    id: 'default-ld-art',
    defId: 'wall-art',
    position: [12.5, 6.55],
    rotation: -Math.PI / 2,
    props: { width: 1.0, height: 0.7 },
  },
  {
    // North window — glass x=[9.595,12.045]. `standoff` (same value the live
    // window-snap sets via windowFixtureProps) shifts rod + panels forward so
    // the fold troughs clear the window's interior sill/frame projection.
    id: 'default-ld-curtain',
    defId: 'curtains',
    position: [10.82, 1.42],
    rotation: 0,
    props: { width: 2.7, height: 2.55, color: '#b9b0a0', standoff: CURTAIN_SILL_STANDOFF },
  },
  // Cove LED along the east wall (false-ceiling lip over the lounge zone).
  {
    id: 'default-ld-cove',
    defId: 'cove-light',
    position: [12.5, 2.9],
    rotation: -Math.PI / 2,
    props: { length: 3.0, mountHeight: 2.38 },
  },
  // Shoe cabinet by the main entrance (east wall of the foyer, east of the
  // door's swing zone).
  {
    id: 'default-ld-shoe',
    defId: 'shoe-cabinet',
    position: [12.325, 7.6],
    rotation: -Math.PI / 2,
    props: { width: 0.9, depth: 0.3 },
  },
  // ── Set-dressing decor props ────────────────────────────────────────────
  // Fruit bowl centred on the coffee table top (h=0.42 m).
  {
    id: 'default-ld-decor-fruitbowl',
    defId: 'fruit-bowl',
    position: [10.3, 2.4],
    rotation: 0,
    props: { surfaceHeight: 0.42 },
  },
  // Magazine stack on one end of the coffee table.
  {
    id: 'default-ld-decor-magazines',
    defId: 'magazine-stack',
    position: [10.65, 2.7],
    rotation: 0.3,
    props: { surfaceHeight: 0.42 },
  },
  // Throw cushion at one end of the sofa (seat h ≈ 0.46 m; cushions on back).
  {
    id: 'default-ld-decor-cushion1',
    defId: 'throw-cushion',
    position: [11.275, 1.65],
    rotation: -Math.PI / 2,
    props: { surfaceHeight: 0.46, color: '#9b7a68', accentColor: '#6a5040' },
  },
  // Throw cushion at the other end of the sofa.
  {
    id: 'default-ld-decor-cushion2',
    defId: 'throw-cushion',
    position: [11.275, 3.5],
    rotation: -Math.PI / 2,
    props: { surfaceHeight: 0.46, color: '#7a9090', accentColor: '#556868' },
  },
  // Throw blanket draped over the sofa arm.
  {
    id: 'default-ld-decor-blanket',
    defId: 'throw-blanket',
    position: [11.375, 3.4],
    rotation: -Math.PI / 2,
    props: { surfaceHeight: 0.46, color: '#c8b89a', pattern: 'herringbone' },
  },
  // Candle cluster on the dining table as a centrepiece (h=0.74 m).
  {
    id: 'default-ld-decor-candles',
    defId: 'candle-cluster',
    position: [11.0, 5.8],
    rotation: 0,
    props: { surfaceHeight: 0.74, flame: 'yes' },
  },
  // Small sculpture on top of the TV console (h=0.45 m), one side. Nudged
  // east 0.125 m with the console (see its comment).
  {
    id: 'default-ld-decor-sculpture',
    defId: 'small-sculpture',
    position: [9.6, 1.7],
    rotation: Math.PI / 2,
    props: { surfaceHeight: 0.45, style: 'arch', color: '#c0a87a' },
  },
]
