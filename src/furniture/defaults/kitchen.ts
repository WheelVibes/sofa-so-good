import type { LayoutEntry } from './types'

/** Kitchen — interior main [6.225,6.975]→[9.73,9.075] (3.505 × 2.1 m), plus a
 *  small east extension. South wall is 300 mm thick (not the flat's usual
 *  200 mm) — see `apartment/constants.ts`'s `wall-ext-S` derivation — so its
 *  interior face sits at z=9.075, not 9.125. North wall (the household-
 *  shelter RC ring's south wall) is ALSO 300 mm (v0.23.1.8), moving its
 *  interior face 6.875 → 6.975 — every counter/fridge/cabinet item flush to
 *  it below is shifted +0.1 m from its pre-v0.23.1.8 position. Service-yard
 *  door on the WEST wall (x=6.225 face) z=[7.6,8.4] — kept clear. The EAST
 *  side is open to living/dining (no wall at x=9.73), so counters back onto
 *  the north wall (z=6.975 face) or the south wall (z=9.075 face) instead.
 *
 *  Counter + fridge both back onto the NORTH wall (fridge at the west end,
 *  away from the service-yard door on the west wall); stove + hood on the
 *  south wall at the east end.
 *
 *  Service yard [4.705,6.875]→[6.125,9.075] (1.42 × 2.2 m). The WEST wall is
 *  a half-height parapet (open above — no window); door on the EAST wall
 *  z=[7.6,8.4] (into the kitchen). The washer sits flush to the EAST wall,
 *  south of the door zone; the drying rack sits clear of both. */
export const kitchen: LayoutEntry[] = [
  {
    id: 'default-k-counter-n',
    defId: 'kitchen-counter-l',
    // Length 2.6 m centred at x=7.575 → spans x=[6.275,8.875]; back face at
    // z≈7.025 (wall inner face 6.975 + 0.05 m gap). East of the fridge.
    // Shifted +0.1 m (v0.23.1.8, north wall thickened): 7.225 → 7.325.
    position: [7.575, 7.325],
    rotation: 0,
    props: { length: 2.6, hasSink: 'yes' },
  },
  {
    // Flush to the north wall, east end of the run — clear of the service-
    // yard door (west wall) and the counter (west of it). Shifted +0.1 m
    // (v0.23.1.8, north wall thickened): 7.275 → 7.375.
    id: 'default-k-fridge',
    defId: 'refrigerator',
    position: [9.3, 7.375],
    rotation: 0,
    props: {},
  },
  {
    id: 'default-k-pendant',
    defId: 'ceiling-light',
    position: [7.98, 8.0],
    rotation: 0,
    props: { style: 'flush' },
  },
  {
    id: 'default-k-stove',
    defId: 'stove',
    // Flush to south wall (z≈9.075−0.05−0.30=8.725), east end.
    position: [9.3, 8.725],
    rotation: Math.PI,
    props: {},
  },
  {
    id: 'default-k-hood',
    defId: 'range-hood',
    position: [9.3, 8.725],
    rotation: Math.PI,
    props: {},
  },
  // Washing machine in the service yard — flush to the east wall (south of
  // the door zone at z=[7.6,8.4]) and the south wall.
  {
    id: 'default-sy-washer',
    defId: 'washing-machine',
    position: [5.775, 8.725],
    rotation: -Math.PI / 2,
    props: {},
  },
  { id: 'default-sy-rack', defId: 'drying-rack', position: [5.3, 7.2], rotation: 0, props: {} },
  // Upper cabinets above the counter run, against the north wall. Shifted
  // +0.1 m (v0.23.1.8, north wall thickened): 6.95 → 7.05.
  {
    id: 'default-k-uppers',
    defId: 'wall-cabinet',
    position: [7.575, 7.05],
    rotation: 0,
    props: { length: 2.6 },
  },
  {
    id: 'default-k-microwave',
    defId: 'microwave',
    // On the counter surface near the west end (away from the stove).
    // Shifted +0.1 m with the counter above: 7.225 → 7.325.
    position: [6.8, 7.325],
    rotation: 0,
    props: { surfaceHeight: 0.9 },
  },
]
