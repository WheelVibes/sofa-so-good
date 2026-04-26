import type { LayoutEntry } from './types';

/** Bedroom 2 — interior origin (3.15, 0.20), 2.85 × 3.40 m.
 *  Single bed along the east-side wall, desk against the south wall. */
export const bedroom2: LayoutEntry[] = [
  {
    id: 'default-b2-bed-single',
    defId: 'bed-single',
    position: [4.10, 1.20],
    rotation: 0,
    props: {},
  },
  {
    id: 'default-b2-desk',
    defId: 'desk',
    position: [4.55, 3.20],
    rotation: 0,
    props: { width: 1.2, depth: 0.55 },
  },
];
