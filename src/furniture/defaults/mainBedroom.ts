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
  { id: 'default-main-nightstand', defId: 'nightstand', position: [2.05, 0.75], rotation: 0, props: {} },
  { id: 'default-main-tablelamp', defId: 'table-lamp', position: [2.05, 0.75], rotation: 0, props: { surfaceHeight: 0.52 } },
  { id: 'default-main-lamp', defId: 'floor-lamp', position: [0.6, 3.15], rotation: 0, props: {} },
  { id: 'default-main-rug', defId: 'rug', position: [1.4, 2.85], rotation: 0, props: { width: 1.7, depth: 1.1, color: '#8f857a', borderColor: '#5f574c' } },
  { id: 'default-main-pendant', defId: 'ceiling-light', position: [1.5, 2.4], rotation: 0, props: { style: 'flush' } },
  { id: 'default-main-curtain', defId: 'curtains', position: [0.28, 2.2], rotation: Math.PI / 2, props: { width: 2.3, height: 2.3, color: '#c8bca8' } },
];
