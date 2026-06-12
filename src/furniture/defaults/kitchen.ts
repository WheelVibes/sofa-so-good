import type { LayoutEntry } from './types'

/** Kitchen — interior origin (6.40, 6.80), 3.70 × 2.35 m.
 *  Counter run along the north wall (back at z≈6.85 = wall inner face + 0.05 m gap);
 *  fridge flush to west + south walls at the SW corner (work-triangle end);
 *  stove flush to south wall at the east end, away from the SY door (x≈6.35).
 *  All placements honour CLEARANCE.wallGap = 0.05 m from interior wall faces. */
export const kitchen: LayoutEntry[] = [
  {
    id: 'default-k-counter-n',
    defId: 'kitchen-counter-l',
    // Length 3.4 m centred at x=8.2 → spans x=[6.5,9.9]; back face at z≈6.85 (wall+gap).
    position: [8.2, 7.15],
    rotation: 0,
    props: { length: 3.4, hasSink: 'yes' },
  },
  {
    id: 'default-k-fridge',
    defId: 'refrigerator',
    // Flush to west wall (inner x≈6.40+0.05+0.35=6.80) and south wall (z≈9.15−0.05−0.35=8.75).
    position: [6.8, 8.75],
    rotation: Math.PI,
    props: {},
  },
  {
    id: 'default-k-pendant',
    defId: 'ceiling-light',
    position: [8.5, 8.0],
    rotation: 0,
    props: { style: 'flush' },
  },
  {
    id: 'default-k-stove',
    defId: 'stove',
    // Flush to south wall (z≈9.15−0.05−0.30=8.80) at east end (x=9.55).
    position: [9.55, 8.8],
    rotation: Math.PI,
    props: {},
  },
  {
    id: 'default-k-hood',
    defId: 'range-hood',
    position: [9.55, 8.8],
    rotation: Math.PI,
    props: {},
  },
  // Washing machine in the service yard (origin 3.90, 6.80 — 2.40 × 2.35 m).
  // Flush to south wall (z≈9.15−0.05−0.30=8.80) and west SY wall (x≈3.95+0.05+0.30=4.30).
  {
    id: 'default-sy-washer',
    defId: 'washing-machine',
    position: [4.3, 8.8],
    rotation: Math.PI,
    props: {},
  },
  { id: 'default-sy-rack', defId: 'drying-rack', position: [5.4, 8.3], rotation: 0, props: {} },
  // Upper cabinets above the counter run, against the north wall.
  {
    id: 'default-k-uppers',
    defId: 'wall-cabinet',
    position: [8.2, 6.95],
    rotation: 0,
    props: { length: 3.4 },
  },
  {
    id: 'default-k-microwave',
    defId: 'microwave',
    // On the counter surface near the west end (away from the stove).
    position: [7.0, 7.15],
    rotation: 0,
    props: { surfaceHeight: 0.9 },
  },
]
