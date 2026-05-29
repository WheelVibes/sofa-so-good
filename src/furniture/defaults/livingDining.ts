import type { LayoutEntry } from './types';

/** Living / Dining — main rectangle origin (8.55, 1.40), 4.00 × 5.40 m,
 *  plus SE alcove offset (1.55, 5.40), 2.45 × 1.10 m.
 *
 *  The west boundary at z<3.65 is the wall-int-b3-LD partition at x=9.05,
 *  so all main-area items sit east of that line. Below z>3.65 the
 *  corridor opens westward at x=[8.55, 9.00], so dining items also
 *  stay east of x=9.10 to avoid blocking the corridor entrance. */
export const livingDining: LayoutEntry[] = [
  {
    id: 'default-ld-sofa',
    defId: 'sofa-3seat',
    position: [10.65, 2.45],
    rotation: 0,
    props: {},
  },
  {
    id: 'default-ld-tv-console',
    defId: 'tv-console',
    position: [12.10, 2.45],
    rotation: -Math.PI / 2,
    props: { width: 1.6 },
  },
  {
    id: 'default-ld-dining-table',
    defId: 'dining-table-4',
    position: [10.55, 5.20],
    rotation: 0,
    props: { seats: '4' },
  },
  // Dining chairs — two per long side of the 1.4 m table.
  { id: 'default-ld-chair-n1', defId: 'dining-chair', position: [10.2, 4.45], rotation: 0, props: {} },
  { id: 'default-ld-chair-n2', defId: 'dining-chair', position: [10.9, 4.45], rotation: 0, props: {} },
  { id: 'default-ld-chair-s1', defId: 'dining-chair', position: [10.2, 5.95], rotation: Math.PI, props: {} },
  { id: 'default-ld-chair-s2', defId: 'dining-chair', position: [10.9, 5.95], rotation: Math.PI, props: {} },
  // Lounge zone in front of the sofa.
  { id: 'default-ld-rug', defId: 'rug', position: [10.65, 3.55], rotation: 0, props: { width: 2.2, depth: 1.5 } },
  { id: 'default-ld-coffee', defId: 'coffee-table', position: [10.65, 3.55], rotation: 0, props: {} },
  { id: 'default-ld-armchair', defId: 'armchair', position: [11.4, 7.3], rotation: Math.PI, props: {} },
  { id: 'default-ld-plant', defId: 'potted-plant', position: [12.2, 6.3], rotation: 0, props: { size: 'large' } },
  { id: 'default-ld-lamp', defId: 'floor-lamp', position: [9.35, 1.95], rotation: 0, props: {} },
  { id: 'default-ld-pendant', defId: 'ceiling-light', position: [10.65, 3.55], rotation: 0, props: { style: 'pendant' } },
  { id: 'default-ld-pendant-dining', defId: 'ceiling-light', position: [10.55, 5.20], rotation: 0, props: { style: 'pendant' } },
  { id: 'default-ld-aircon', defId: 'aircon-unit', position: [10.6, 1.55], rotation: 0, props: {} },
];
