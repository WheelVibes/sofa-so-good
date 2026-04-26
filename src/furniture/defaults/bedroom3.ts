import type { LayoutEntry } from './types';

/** Bedroom 3 — interior origin (6.10, 0.20), 2.85 × 3.40 m.
 *  Double bed against the north wall and a bookshelf along the west side. */
export const bedroom3: LayoutEntry[] = [
  {
    id: 'default-b3-bed-double',
    defId: 'bed-double',
    position: [7.10, 1.30],
    rotation: 0,
    props: {},
  },
  {
    id: 'default-b3-bookshelf',
    defId: 'bookshelf',
    position: [8.85, 1.20],
    rotation: -Math.PI / 2,
    props: { width: 0.9, height: 1.6 },
  },
];
