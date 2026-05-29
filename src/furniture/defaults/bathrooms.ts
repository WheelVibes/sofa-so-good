import type { LayoutEntry } from './types';

/** Bath 1 — origin (1.45, 5.10), 2.40 × 1.60 m; Bath 2 — origin
 *  (3.95, 5.10), 2.05 × 1.60 m. WC against the south wall, basin against
 *  the east wall. */
export const bathrooms: LayoutEntry[] = [
  // Bath 1
  { id: 'default-bath1-wc', defId: 'toilet', position: [1.95, 6.25], rotation: Math.PI, props: {} },
  { id: 'default-bath1-basin', defId: 'bathroom-sink', position: [3.55, 5.55], rotation: -Math.PI / 2, props: {} },
  { id: 'default-bath1-mirror', defId: 'bathroom-mirror', position: [3.78, 5.55], rotation: -Math.PI / 2, props: { width: 0.5, height: 0.7, mountHeight: 1.5 } },
  { id: 'default-bath1-light', defId: 'ceiling-light', position: [2.65, 5.9], rotation: 0, props: { style: 'flush', mountHeight: 2.4 } },
  // Bath 2
  { id: 'default-bath2-wc', defId: 'toilet', position: [4.45, 6.25], rotation: Math.PI, props: {} },
  { id: 'default-bath2-basin', defId: 'bathroom-sink', position: [5.7, 5.55], rotation: -Math.PI / 2, props: {} },
  { id: 'default-bath2-mirror', defId: 'bathroom-mirror', position: [5.93, 5.55], rotation: -Math.PI / 2, props: { width: 0.5, height: 0.7, mountHeight: 1.5 } },
  { id: 'default-bath2-light', defId: 'ceiling-light', position: [4.95, 5.9], rotation: 0, props: { style: 'flush', mountHeight: 2.4 } },
];
