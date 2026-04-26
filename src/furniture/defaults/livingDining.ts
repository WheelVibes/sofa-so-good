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
];
