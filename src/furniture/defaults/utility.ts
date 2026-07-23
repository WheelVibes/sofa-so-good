import type { LayoutEntry } from './types'

/** Utility / circulation room lighting. Every real SG home lights its corridor,
 *  household shelter and service yard, but these rooms carry no other default
 *  furniture (a corridor stays clear; the shelter is a bare bomb shelter; the
 *  service yard's washer/rack live in `kitchen.ts`). Each gets ONE flush-mount
 *  ceiling light at the room centre so the Design score's "Lighting coverage"
 *  no longer flags them as unlit. Ceiling lights are `mounted`+`noClip`, so they
 *  never clip a wall or block a door — placement guards ignore them. */
export const utility: LayoutEntry[] = [
  // Corridor — [3.525,3.825]→[9.125,4.825] → centre (6.325, 4.325).
  {
    id: 'default-corr-light',
    defId: 'ceiling-light',
    position: [6.325, 4.325],
    rotation: 0,
    props: { style: 'flush' },
  },
  // Household Shelter — [5.915,5.025]→[8.065,6.675] (the RC ring thickened to
  // 300 mm on all four sides, shrinking 2.35×1.85 → 2.15×1.65) → centre
  // unchanged at (6.99, 5.85) since the shrink is symmetric on each axis.
  {
    id: 'default-hs-light',
    defId: 'ceiling-light',
    position: [6.99, 5.85],
    rotation: 0,
    props: { style: 'flush' },
  },
  // Service Yard — [4.705,6.875]→[6.125,9.075] → centre (5.415, 7.975). South
  // wall is 300 mm thick (see apartment/constants.ts wall-ext-S derivation),
  // moving the interior face 9.125 → 9.075.
  {
    id: 'default-sy-light',
    defId: 'ceiling-light',
    position: [5.415, 7.975],
    rotation: 0,
    props: { style: 'flush' },
  },
]
