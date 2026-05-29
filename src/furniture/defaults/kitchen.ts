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
  { id: 'default-k-stove', defId: 'stove', position: [9.55, 8.6], rotation: Math.PI, props: {} },
  { id: 'default-k-hood', defId: 'range-hood', position: [9.55, 8.6], rotation: Math.PI, props: {} },
  // Washing machine in the service yard (origin 3.90, 6.80 — 2.40 × 2.35 m).
  { id: 'default-sy-washer', defId: 'washing-machine', position: [4.35, 8.55], rotation: Math.PI, props: {} },
  // Upper cabinets above the counter run, against the north wall.
  { id: 'default-k-uppers', defId: 'wall-cabinet', position: [8.20, 6.95], rotation: 0, props: { length: 3.4 } },
  { id: 'default-k-microwave', defId: 'microwave', position: [7.0, 7.25], rotation: 0, props: { surfaceHeight: 0.9 } },
];
