/**
 * Pre-arranged furniture "sets" (vignettes) the user can drop in one click —
 * a whole dining set, bedroom set, lounge or study nook lands already arranged
 * and group-selected, ready to drag into place. Offsets are metres relative to
 * the drop point; rotations in radians (items face +Z by default).
 */
import type { ParamProps } from './types'

export interface SetItem {
  defId: string
  dx: number
  dz: number
  rotation: number
  props?: ParamProps
}

export interface FurnitureSet {
  id: string
  name: string
  items: SetItem[]
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
    id: 'nursery',
    name: 'Nursery set',
    items: [
      { defId: 'crib', dx: 0, dz: 0, rotation: 0 },
      { defId: 'changing-table', dx: 1.55, dz: 0, rotation: 0 },
      { defId: 'armchair', dx: -1.4, dz: 0.1, rotation: Math.PI / 2, props: { style: 'standard' } },
      { defId: 'floor-lamp', dx: -1.4, dz: -0.9, rotation: 0 },
    ],
  },
  {
    // The grown-up sibling of the nursery: a toddler bed against the wall with a
    // bedside nightstand + lamp, a low toy-storage organiser and a soft play rug —
    // the kids' room once they've graduated from the crib.
    id: 'kids-room',
    name: 'Kids room set',
    items: [
      { defId: 'rug', dx: 0, dz: 0.45, rotation: 0, props: { width: 1.8, depth: 2.0 } },
      { defId: 'toddler-bed', dx: 0, dz: 0, rotation: 0 },
      { defId: 'nightstand', dx: 0.68, dz: -0.5, rotation: 0 },
      { defId: 'table-lamp', dx: 0.68, dz: -0.5, rotation: 0, props: { surfaceHeight: 0.5 } },
      {
        defId: 'toy-storage',
        dx: -1.05,
        dz: -0.55,
        rotation: 0,
        props: { cols: 3, rows: 2 },
      },
    ],
  },
  {
    id: 'reading-nook',
    name: 'Reading nook',
    items: [
      { defId: 'armchair', dx: 0, dz: 0, rotation: 0, props: { style: 'wingback' } },
      { defId: 'floor-lamp', dx: 0.75, dz: -0.35, rotation: 0, props: { base: 'arc' } },
      { defId: 'side-table', dx: -0.6, dz: 0.05, rotation: 0 },
      { defId: 'ottoman', dx: 0, dz: 0.7, rotation: 0, props: { shape: 'round' } },
      {
        defId: 'potted-plant',
        dx: 1.0,
        dz: 0.4,
        rotation: 0,
        props: { size: 'large', type: 'fiddle' },
      },
      { defId: 'hanging-plant', dx: -0.5, dz: -0.5, rotation: 0, props: { size: 'medium' } },
    ],
  },
  {
    id: 'entryway',
    name: 'Entryway set',
    items: [
      { defId: 'shoe-cabinet', dx: 0, dz: 0, rotation: 0, props: { width: 0.9 } },
      { defId: 'coat-rack', dx: -0.9, dz: 0.05, rotation: 0, props: {} },
      { defId: 'bench', dx: 0.9, dz: 0.05, rotation: 0, props: { style: 'upholstered' } },
      {
        defId: 'floor-vase',
        dx: 1.7,
        dz: 0.05,
        rotation: 0,
        props: { shape: 'tall', stems: 'pampas' },
      },
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
  {
    // A modular kitchen run: three 0.6 m base cabinets (sink · hob · drawers) in
    // a row with matching wall uppers above and a tall pantry at the end — the
    // parametric cabinet engine assembled into a one-click kitchen.
    id: 'kitchen-run',
    name: 'Kitchen run',
    items: [
      {
        defId: 'cabinet-base',
        dx: -0.6,
        dz: 0,
        rotation: 0,
        props: { worktop: 'sink', front: 'slab' },
      },
      {
        defId: 'cabinet-base',
        dx: 0,
        dz: 0,
        rotation: 0,
        props: { worktop: 'hob', front: 'drawers' },
      },
      {
        defId: 'cabinet-base',
        dx: 0.6,
        dz: 0,
        rotation: 0,
        props: { worktop: 'none', front: 'drawers' },
      },
      { defId: 'cabinet-wall', dx: -0.6, dz: -0.13, rotation: 0, props: { front: 'slab' } },
      { defId: 'cabinet-wall', dx: 0, dz: -0.13, rotation: 0, props: { front: 'slab' } },
      { defId: 'cabinet-wall', dx: 0.6, dz: -0.13, rotation: 0, props: { front: 'glass' } },
      {
        defId: 'cabinet-tall',
        dx: 1.4,
        dz: 0,
        rotation: 0,
        props: { cornice: 'yes', front: 'slab' },
      },
    ],
  },
  {
    // A balcony bistro: a slatted table with two facing chairs and a planter
    // behind — the outdoor pieces dropped as a ready-made set.
    id: 'balcony',
    name: 'Balcony set',
    items: [
      { defId: 'outdoor-table', dx: 0, dz: 0, rotation: 0 },
      { defId: 'outdoor-chair', dx: -0.6, dz: 0, rotation: Math.PI / 2 },
      { defId: 'outdoor-chair', dx: 0.6, dz: 0, rotation: -Math.PI / 2 },
      { defId: 'planter-trough', dx: 0, dz: -0.95, rotation: 0, props: { length: 1.2 } },
    ],
  },
]
