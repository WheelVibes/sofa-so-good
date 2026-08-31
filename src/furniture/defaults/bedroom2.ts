import { CURTAIN_SILL_STANDOFF } from '../placement/windowSnap'
import type { LayoutEntry } from './types'

/** Bedroom 2 — interior [3.38,0.20]→[6.14,3.725] (2.76 × 3.525 m). Window
 *  north x=[3.75,5.25]. Door in the south wall x=[4.99,5.79], swinging into
 *  the room toward the east partition.
 *  RM4 refresh: a KIDS / GUEST room — a single bed with a bedside nightstand
 *  and a sliding wardrobe on the south wall WEST of the door (clear of its
 *  swing). Warm rug + wall art keep it inviting. */
export const bedroom2: LayoutEntry[] = [
  {
    id: 'default-b2-bed-single',
    defId: 'bed-single',
    position: [4.33, 1.2],
    rotation: 0,
    props: {},
  },
  {
    id: 'default-b2-nightstand',
    defId: 'nightstand',
    position: [5.13, 0.6],
    rotation: 0,
    props: {},
  },
  {
    id: 'default-b2-tablelamp',
    defId: 'table-lamp',
    position: [5.13, 0.6],
    rotation: 0,
    props: { surfaceHeight: 0.52 },
  },
  {
    // Sliding wardrobe on the south wall, west of the door (no swing
    // clearance needed) — clear of the door's swing arc toward the east.
    id: 'default-b2-wardrobe',
    defId: 'wardrobe-3door',
    position: [4.13, 3.375],
    rotation: Math.PI,
    props: { width: 1.4, doorStyle: 'sliding' },
  },
  {
    id: 'default-b2-rug',
    defId: 'rug',
    position: [4.5, 1.75],
    rotation: 0,
    props: { width: 1.5, depth: 1.0, color: '#8a8f86', borderColor: '#5a605a' },
  },
  {
    id: 'default-b2-art',
    defId: 'wall-art',
    position: [6.1, 1.9],
    rotation: -Math.PI / 2,
    props: { width: 0.7, height: 0.5, artColor: '#c98a86' },
  },
  {
    id: 'default-b2-pendant',
    defId: 'ceiling-light',
    position: [4.76, 2.0],
    rotation: 0,
    props: { style: 'flush' },
  },
  // ── Set-dressing decor props ─────────────────────────────────────────────
  // Small desk plant on the nightstand surface (h=0.52 m).
  {
    id: 'default-b2-decor-plant',
    defId: 'desk-plant',
    position: [5.13, 0.6],
    rotation: 0,
    props: { surfaceHeight: 0.52, type: 'succulent', potColor: '#b89070', leafColor: '#5a9a4a' },
  },
  // Throw cushion on the bed.
  {
    id: 'default-b2-decor-cushion',
    defId: 'throw-cushion',
    position: [4.33, 0.9],
    rotation: 0,
    props: { surfaceHeight: 0.46, color: '#9fb0c0', accentColor: '#5a6b7a', shape: 'rect' },
  },
  {
    // North (W1) window — glass x=[3.75,5.25], sill 0.55.
    id: 'default-b2-curtain',
    defId: 'curtains',
    position: [4.5, 0.28],
    rotation: 0,
    props: {
      width: 1.9,
      height: 2.55,
      color: '#c8bca8',
      standoff: CURTAIN_SILL_STANDOFF,
      drawAmount: 0,
    },
  },
]
