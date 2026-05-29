import type { LayoutEntry } from './types';

/** Kitchen — interior origin (6.40, 6.80), 3.70 × 2.35 m.
 *  L-shaped kitchen counter along the north wall (with sink). */
export const kitchen: LayoutEntry[] = [
  {
    id: 'default-k-counter-n',
    defId: 'kitchen-counter-l',
    position: [8.20, 7.20],
    rotation: 0,
    props: { length: 3.4, hasSink: 'yes' },
  },
  { id: 'default-k-fridge', defId: 'refrigerator', position: [6.85, 8.6], rotation: Math.PI, props: {} },
  { id: 'default-k-pendant', defId: 'ceiling-light', position: [8.5, 8.0], rotation: 0, props: { style: 'flush' } },
];
