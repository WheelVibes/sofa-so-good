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
  { id: 'default-ld-decor', defId: 'tabletop-decor', position: [10.65, 3.55], rotation: 0.3, props: { surfaceHeight: 0.42 } },
  { id: 'default-ld-armchair', defId: 'armchair', position: [11.4, 7.3], rotation: Math.PI, props: {} },
  { id: 'default-ld-sidetable', defId: 'side-table', position: [10.6, 7.25], rotation: 0, props: {} },
  { id: 'default-ld-sidelamp', defId: 'table-lamp', position: [10.6, 7.25], rotation: 0, props: { surfaceHeight: 0.5 } },
  { id: 'default-ld-plant', defId: 'potted-plant', position: [12.2, 6.3], rotation: 0, props: { size: 'large', type: 'snake' } },
  { id: 'default-ld-lamp', defId: 'floor-lamp', position: [9.35, 1.95], rotation: 0, props: {} },
  { id: 'default-ld-fan', defId: 'ceiling-fan', position: [10.65, 3.55], rotation: 0, props: {} },
  { id: 'default-ld-pendant-dining', defId: 'ceiling-light', position: [10.55, 5.20], rotation: 0, props: { style: 'pendant' } },
  { id: 'default-ld-aircon', defId: 'aircon-unit', position: [10.6, 1.55], rotation: 0, props: {} },
  { id: 'default-ld-art', defId: 'wall-art', position: [12.5, 4.4], rotation: -Math.PI / 2, props: { width: 1.0, height: 0.7 } },
  { id: 'default-ld-curtain', defId: 'curtains', position: [10.85, 1.5], rotation: 0, props: { width: 2.8, height: 2.3, color: '#b9b0a0' } },
  // Cove LED along the east wall (false-ceiling lip over the TV/lounge zone).
  { id: 'default-ld-cove', defId: 'cove-light', position: [12.5, 2.6], rotation: -Math.PI / 2, props: { length: 3.4, mountHeight: 2.38 } },
  // Shoe cabinet by the main entrance (east wall, just inside the door).
  { id: 'default-ld-shoe', defId: 'shoe-cabinet', position: [12.35, 7.45], rotation: -Math.PI / 2, props: { width: 0.9, depth: 0.3 } },
  // Wall-mounted TV above the console on the east wall, facing west.
  { id: 'default-ld-tv', defId: 'tv-wall', position: [12.45, 2.45], rotation: -Math.PI / 2, props: { size: '65', mount: 'wall', mountHeight: 1.3, screen: 'on' } },
];
