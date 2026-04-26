import type { LayoutEntry } from './types';

/** Main bedroom — interior origin (0.20, 0.20), 2.85 × 3.40 m.
 *  Queen bed against north wall, wardrobe rotated against east wall. */
export const mainBedroom: LayoutEntry[] = [
  {
    id: 'default-main-bed-queen',
    defId: 'bed-queen',
    position: [1.05, 1.30],
    rotation: 0,
    props: {},
  },
  {
    id: 'default-main-wardrobe',
    defId: 'wardrobe-3door',
    position: [2.70, 1.90],
    rotation: -Math.PI / 2,
    props: { width: 1.4 },
  },
];
