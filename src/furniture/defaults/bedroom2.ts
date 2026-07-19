import type { LayoutEntry } from './types'

/** Bedroom 2 — interior origin (3.15, 0.20), 2.85 × 3.40 m.
 *  RM4 refresh: a KIDS / GUEST room — a single bed with a bedside nightstand
 *  and a sliding wardrobe on the south wall (the study desk moved to bedroom 3,
 *  the flexi room). Warm rug + wall art keep it inviting. */
export const bedroom2: LayoutEntry[] = [
  {
    id: 'default-b2-bed-single',
    defId: 'bed-single',
    position: [4.1, 1.2],
    rotation: 0,
    props: {},
  },
  {
    id: 'default-b2-nightstand',
    defId: 'nightstand',
    position: [4.9, 0.6],
    rotation: 0,
    props: {},
  },
  {
    id: 'default-b2-tablelamp',
    defId: 'table-lamp',
    position: [4.9, 0.6],
    rotation: 0,
    props: { surfaceHeight: 0.52 },
  },
  {
    // Sliding wardrobe on the south wall, west of the door (no swing clearance).
    id: 'default-b2-wardrobe',
    defId: 'wardrobe-3door',
    position: [4.2, 3.3],
    rotation: Math.PI,
    props: { width: 1.4, doorStyle: 'sliding' },
  },
  {
    id: 'default-b2-rug',
    defId: 'rug',
    position: [4.5, 1.7],
    rotation: 0,
    props: { width: 1.5, depth: 1.0, color: '#8a8f86', borderColor: '#5a605a' },
  },
  {
    id: 'default-b2-art',
    defId: 'wall-art',
    position: [5.96, 1.9],
    rotation: -Math.PI / 2,
    props: { width: 0.7, height: 0.5, artColor: '#c98a86' },
  },
  {
    id: 'default-b2-pendant',
    defId: 'ceiling-light',
    position: [4.55, 2.4],
    rotation: 0,
    props: { style: 'flush' },
  },
  // ── Set-dressing decor props ─────────────────────────────────────────────
  // Small desk plant on the nightstand surface (h=0.52 m).
  {
    id: 'default-b2-decor-plant',
    defId: 'desk-plant',
    position: [4.9, 0.6],
    rotation: 0,
    props: { surfaceHeight: 0.52, type: 'succulent', potColor: '#b89070', leafColor: '#5a9a4a' },
  },
  // Throw cushion on the bed.
  {
    id: 'default-b2-decor-cushion',
    defId: 'throw-cushion',
    position: [4.1, 0.9],
    rotation: 0,
    props: { surfaceHeight: 0.46, color: '#9fb0c0', accentColor: '#5a6b7a', shape: 'rect' },
  },
]
