import type { LayoutEntry } from './types'

/** Bedroom 3 — interior origin (6.10, 0.20), 2.85 × 3.40 m.
 *  Double bed against the north wall and a bookshelf along the west side. */
export const bedroom3: LayoutEntry[] = [
  {
    id: 'default-b3-bed-double',
    defId: 'bed-double',
    position: [7.1, 1.3],
    rotation: 0,
    props: {},
  },
  {
    id: 'default-b3-bookshelf',
    defId: 'bookshelf',
    position: [8.8, 1.2],
    rotation: -Math.PI / 2,
    props: { width: 0.9, height: 1.6 },
  },
  {
    id: 'default-b3-nightstand',
    defId: 'nightstand',
    position: [8.1, 0.7],
    rotation: 0,
    props: {},
  },
  {
    id: 'default-b3-tablelamp',
    defId: 'table-lamp',
    position: [8.1, 0.7],
    rotation: 0,
    props: { surfaceHeight: 0.52 },
  },
  {
    id: 'default-b3-plant',
    defId: 'potted-plant',
    position: [6.5, 3.1],
    rotation: 0,
    props: { size: 'small' },
  },
  {
    id: 'default-b3-rug',
    defId: 'rug',
    position: [7.4, 2.9],
    rotation: 0,
    props: { width: 1.6, depth: 1.0, color: '#7e8a86', borderColor: '#566460' },
  },
  {
    id: 'default-b3-art',
    defId: 'wall-art',
    position: [6.14, 2.6],
    rotation: Math.PI / 2,
    props: { width: 0.7, height: 0.5, artColor: '#86a6b0' },
  },
  {
    id: 'default-b3-pendant',
    defId: 'ceiling-light',
    position: [7.5, 2.4],
    rotation: 0,
    props: { style: 'flush' },
  },
  { id: 'default-b3-fan', defId: 'standing-fan', position: [8.5, 3.15], rotation: -0.6, props: {} },
]
