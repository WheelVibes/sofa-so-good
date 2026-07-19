import type { LayoutEntry } from './types'

/** Living / Dining — main rectangle origin (8.55, 1.40), 4.00 × 5.40 m,
 *  plus SE alcove offset (1.55, 5.40), 2.45 × 1.10 m.
 *
 *  The west boundary at z<3.65 is the wall-int-b3-LD partition at x=9.05,
 *  so all main-area items sit east of that line. Below z>3.65 the
 *  corridor opens westward at x=[8.55, 9.00], so dining items also
 *  stay east of x=9.10 to avoid blocking the corridor entrance. */
export const livingDining: LayoutEntry[] = [
  // Sofa on the west side, FACING THE TV on the east wall (back to the solid
  // b3 partition). Seating faces the screen; the TV is on a windowless wall.
  {
    id: 'default-ld-sofa',
    defId: 'sofa-3seat',
    position: [9.6, 2.55],
    rotation: Math.PI / 2,
    props: {},
  },
  {
    id: 'default-ld-tv-console',
    defId: 'tv-console',
    position: [12.1, 2.45],
    rotation: -Math.PI / 2,
    props: { width: 1.8 },
  },
  {
    id: 'default-ld-dining-table',
    defId: 'dining-table-4',
    position: [10.55, 5.2],
    rotation: 0,
    props: { seats: '4' },
  },
  // Dining chairs — two per long side of the 1.4 m table.
  {
    id: 'default-ld-chair-n1',
    defId: 'dining-chair',
    position: [10.2, 4.45],
    rotation: 0,
    props: {},
  },
  {
    id: 'default-ld-chair-n2',
    defId: 'dining-chair',
    position: [10.9, 4.45],
    rotation: 0,
    props: {},
  },
  {
    id: 'default-ld-chair-s1',
    defId: 'dining-chair',
    position: [10.2, 5.95],
    rotation: Math.PI,
    props: {},
  },
  {
    id: 'default-ld-chair-s2',
    defId: 'dining-chair',
    position: [10.9, 5.95],
    rotation: Math.PI,
    props: {},
  },
  // Lounge zone between the sofa and the TV wall. Coffee table rotated so its
  // long side runs parallel to the (north-south) sofa.
  {
    id: 'default-ld-rug',
    defId: 'rug',
    position: [10.95, 2.55],
    rotation: 0,
    props: { width: 2.0, depth: 1.8 },
  },
  {
    id: 'default-ld-coffee',
    defId: 'coffee-table',
    position: [10.95, 2.55],
    rotation: Math.PI / 2,
    props: {},
  },
  {
    id: 'default-ld-decor',
    defId: 'tabletop-decor',
    position: [10.95, 2.55],
    rotation: 0.3,
    props: { surfaceHeight: 0.42 },
  },
  // (Entry alcove kept clear for the main door swing — only a flush shoe
  // cabinet + a corner plant live here, no seating in the doorway.)
  {
    id: 'default-ld-plant',
    defId: 'potted-plant',
    position: [12.2, 6.35],
    rotation: 0,
    props: { size: 'large', type: 'snake' },
  },
  { id: 'default-ld-lamp', defId: 'floor-lamp', position: [12.2, 3.85], rotation: 0, props: {} },
  // Ottoman in front of the sofa — pairs with the 3-seater as a sofa+ottoman
  // lounge (RM4), a footstool within reach of the seating.
  {
    id: 'default-ld-ottoman',
    defId: 'ottoman',
    position: [10.7, 3.5],
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
  { id: 'default-ld-fan', defId: 'ceiling-fan', position: [10.95, 2.55], rotation: 0, props: {} },
  {
    id: 'default-ld-pendant-dining',
    defId: 'ceiling-light',
    position: [10.55, 5.2],
    rotation: 0,
    props: { style: 'pendant' },
  },
  { id: 'default-ld-aircon', defId: 'aircon-unit', position: [10.6, 1.55], rotation: 0, props: {} },
  {
    id: 'default-ld-art',
    defId: 'wall-art',
    position: [12.5, 4.4],
    rotation: -Math.PI / 2,
    props: { width: 1.0, height: 0.7 },
  },
  {
    id: 'default-ld-curtain',
    defId: 'curtains',
    position: [10.85, 1.5],
    rotation: 0,
    props: { width: 2.8, height: 2.3, color: '#b9b0a0' },
  },
  // Cove LED along the east wall (false-ceiling lip over the TV/lounge zone).
  {
    id: 'default-ld-cove',
    defId: 'cove-light',
    position: [12.5, 2.6],
    rotation: -Math.PI / 2,
    props: { length: 3.4, mountHeight: 2.38 },
  },
  // Shoe cabinet by the main entrance (east wall, just inside the door).
  {
    id: 'default-ld-shoe',
    defId: 'shoe-cabinet',
    position: [12.35, 7.45],
    rotation: -Math.PI / 2,
    props: { width: 0.9, depth: 0.3 },
  },
  // Wall-mounted TV above the console on the east wall, facing west.
  {
    id: 'default-ld-tv',
    defId: 'tv-wall',
    position: [12.45, 2.45],
    rotation: -Math.PI / 2,
    props: { size: '65', mount: 'wall', mountHeight: 1.3, screen: 'on' },
  },
  // ── Set-dressing decor props ────────────────────────────────────────────
  // Fruit bowl centred on the coffee table top (h=0.42 m).
  {
    id: 'default-ld-decor-fruitbowl',
    defId: 'fruit-bowl',
    position: [10.78, 2.35],
    rotation: 0,
    props: { surfaceHeight: 0.42 },
  },
  // Magazine stack on one end of the coffee table.
  {
    id: 'default-ld-decor-magazines',
    defId: 'magazine-stack',
    position: [11.22, 2.68],
    rotation: 0.3,
    props: { surfaceHeight: 0.42 },
  },
  // Throw cushion at left end of the sofa (seat h ≈ 0.46 m; cushions on back).
  {
    id: 'default-ld-decor-cushion1',
    defId: 'throw-cushion',
    position: [9.62, 2.0],
    rotation: Math.PI / 2,
    props: { surfaceHeight: 0.46, color: '#9b7a68', accentColor: '#6a5040' },
  },
  // Throw cushion at right end of the sofa.
  {
    id: 'default-ld-decor-cushion2',
    defId: 'throw-cushion',
    position: [9.62, 3.1],
    rotation: Math.PI / 2,
    props: { surfaceHeight: 0.46, color: '#7a9090', accentColor: '#556868' },
  },
  // Throw blanket draped over the sofa arm.
  {
    id: 'default-ld-decor-blanket',
    defId: 'throw-blanket',
    position: [9.63, 2.1],
    rotation: Math.PI / 2,
    props: { surfaceHeight: 0.46, color: '#c8b89a', pattern: 'herringbone' },
  },
  // Candle cluster on the dining table as a centrepiece (h=0.74 m).
  {
    id: 'default-ld-decor-candles',
    defId: 'candle-cluster',
    position: [10.55, 5.2],
    rotation: 0,
    props: { surfaceHeight: 0.74, flame: 'yes' },
  },
  // Small sculpture on top of the TV console (h=0.45 m), left side.
  {
    id: 'default-ld-decor-sculpture',
    defId: 'small-sculpture',
    position: [12.08, 1.85],
    rotation: -Math.PI / 2,
    props: { surfaceHeight: 0.45, style: 'arch', color: '#c0a87a' },
  },
]
