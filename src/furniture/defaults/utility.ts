import type { LayoutEntry } from './types'

/** Utility / circulation room lighting. Every real SG home lights its corridor,
 *  household shelter and service yard, but these rooms carry no other default
 *  furniture (a corridor stays clear; the shelter is a bare bomb shelter; the
 *  service yard's washer/rack live in `kitchen.ts`). Each gets ONE flush-mount
 *  ceiling light at the room centre so the Design score's "Lighting coverage"
 *  no longer flags them as unlit. Ceiling lights are `mounted`+`noClip`, so they
 *  never clip a wall or block a door — placement guards ignore them. */
export const utility: LayoutEntry[] = [
  // Corridor — origin (4.35, 3.70), 4.75 × 1.30 m → centre (6.73, 4.35).
  {
    id: 'default-corr-light',
    defId: 'ceiling-light',
    position: [6.73, 4.35],
    rotation: 0,
    props: { style: 'flush' },
  },
  // Household Shelter — origin (6.10, 5.10), 2.35 × 1.60 m → centre (7.28, 5.90).
  {
    id: 'default-hs-light',
    defId: 'ceiling-light',
    position: [7.28, 5.9],
    rotation: 0,
    props: { style: 'flush' },
  },
  // Service Yard — origin (3.90, 6.80), 2.40 × 2.35 m → centre (5.10, 7.98).
  {
    id: 'default-sy-light',
    defId: 'ceiling-light',
    position: [5.1, 7.6],
    rotation: 0,
    props: { style: 'flush' },
  },
]
