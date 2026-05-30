/**
 * Pre-arranged furniture "sets" (vignettes) the user can drop in one click —
 * a whole dining set, bedroom set, lounge or study nook lands already arranged
 * and group-selected, ready to drag into place. Offsets are metres relative to
 * the drop point; rotations in radians (items face +Z by default).
 */
import type { ParamProps } from './types';

export interface SetItem {
  defId: string;
  dx: number;
  dz: number;
  rotation: number;
  props?: ParamProps;
}

export interface FurnitureSet {
  id: string;
  name: string;
  items: SetItem[];
}

export const FURNITURE_SETS: FurnitureSet[] = [
  {
    id: 'dining-4',
    name: 'Dining set (4)',
    items: [
      { defId: 'dining-table-4', dx: 0, dz: 0, rotation: 0, props: { seats: '4' } },
      { defId: 'dining-chair', dx: -0.4, dz: -0.7, rotation: 0 },
      { defId: 'dining-chair', dx: 0.4, dz: -0.7, rotation: 0 },
      { defId: 'dining-chair', dx: -0.4, dz: 0.7, rotation: Math.PI },
      { defId: 'dining-chair', dx: 0.4, dz: 0.7, rotation: Math.PI },
    ],
  },
  {
    id: 'bedroom',
    name: 'Bedroom set',
    items: [
      { defId: 'bed-queen', dx: 0, dz: 0.2, rotation: 0 },
      { defId: 'nightstand', dx: -1.0, dz: -0.65, rotation: 0 },
      { defId: 'nightstand', dx: 1.0, dz: -0.65, rotation: 0 },
      { defId: 'table-lamp', dx: -1.0, dz: -0.65, rotation: 0, props: { surfaceHeight: 0.52 } },
      { defId: 'table-lamp', dx: 1.0, dz: -0.65, rotation: 0, props: { surfaceHeight: 0.52 } },
    ],
  },
  {
    id: 'lounge',
    name: 'Lounge set',
    items: [
      { defId: 'rug', dx: 0, dz: 0, rotation: 0, props: { width: 2.0, depth: 1.8 } },
      { defId: 'sofa-3seat', dx: 0, dz: -0.85, rotation: 0 },
      { defId: 'coffee-table', dx: 0, dz: 0.1, rotation: 0 },
      { defId: 'floor-lamp', dx: 1.15, dz: -0.85, rotation: 0 },
    ],
  },
  {
    id: 'study',
    name: 'Study nook',
    items: [
      { defId: 'desk', dx: 0, dz: 0, rotation: 0, props: { width: 1.4, depth: 0.6 } },
      { defId: 'office-chair', dx: 0, dz: 0.55, rotation: Math.PI, props: {} },
      { defId: 'monitor', dx: 0, dz: -0.18, rotation: 0, props: { screen: 'on' } },
      { defId: 'bookshelf', dx: 1.2, dz: -0.05, rotation: 0, props: { width: 0.9, height: 1.8 } },
    ],
  },
];
