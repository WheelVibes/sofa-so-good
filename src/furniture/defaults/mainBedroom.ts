import { CURTAIN_SILL_STANDOFF } from '../placement/windowSnap'
import type { LayoutEntry } from './types'

/** Main bedroom — interior main body [0.20,0.20]→[3.28,3.725] (3.08 × 3.525 m),
 *  plus an open foyer extension [0.20,3.725]→[3.425,4.825] to the south (kept
 *  clear — it's shared circulation to the MB door + the bath1 door, no
 *  furniture placed there). The room's ONLY window is the north one, glass
 *  x=[0.80,2.60] (sill 0.95) — the west wall is solid. Centred queen bed under
 *  the north window flanked by TWO matching nightstands, a sliding 3-door wardrobe on
 *  the east partition wall (south portion, clear of the open foyer walkway),
 *  reading sconces over the bed head. */
export const mainBedroom: LayoutEntry[] = [
  {
    id: 'default-main-bed-queen',
    defId: 'bed-queen',
    position: [1.7, 1.2],
    rotation: 0,
    props: {},
  },
  {
    // Sliding doors — no swing clearance needed. East partition wall, south
    // portion — the west 2.43 m of the room stays open as a walkway into the
    // foyer (which connects to the MB door + the bath1 door).
    id: 'default-main-wardrobe',
    defId: 'wardrobe-3door',
    position: [2.93, 2.95],
    rotation: -Math.PI / 2,
    props: { width: 1.4, doorStyle: 'sliding' },
  },
  // Matching nightstands flanking the bed head against the north wall.
  {
    id: 'default-main-nightstand-l',
    defId: 'nightstand',
    position: [0.67, 0.45],
    rotation: 0,
    props: {},
  },
  {
    id: 'default-main-nightstand',
    defId: 'nightstand',
    position: [2.73, 0.45],
    rotation: 0,
    props: {},
  },
  {
    id: 'default-main-tablelamp-l',
    defId: 'table-lamp',
    position: [0.67, 0.45],
    rotation: 0,
    props: { surfaceHeight: 0.52 },
  },
  {
    id: 'default-main-tablelamp',
    defId: 'table-lamp',
    position: [2.73, 0.45],
    rotation: 0,
    props: { surfaceHeight: 0.52 },
  },
  // Away from both windows (west wall glass, north wall glass), beside the rug.
  { id: 'default-main-lamp', defId: 'floor-lamp', position: [1.0, 3.4], rotation: 0, props: {} },
  {
    id: 'default-main-rug',
    defId: 'rug',
    position: [1.7, 2.7],
    rotation: 0,
    props: { width: 1.7, depth: 1.1, color: '#8f857a', borderColor: '#5f574c' },
  },
  {
    id: 'default-main-pendant',
    defId: 'ceiling-light',
    position: [1.74, 1.95],
    rotation: 0,
    props: { style: 'flush' },
  },
  {
    // North window — glass x=[0.8,2.6], sill 0.95 (the room's only window).
    id: 'default-main-curtain',
    defId: 'curtains',
    position: [1.7, 0.28],
    rotation: 0,
    props: { width: 2.2, height: 2.55, color: '#c8bca8', standoff: CURTAIN_SILL_STANDOFF },
  },
  // Reading sconces flanking the bed on the north wall.
  {
    id: 'default-main-sconce-l',
    defId: 'wall-sconce',
    position: [1.1, 0.3],
    rotation: 0,
    props: { mountHeight: 1.45 },
  },
  {
    id: 'default-main-sconce-r',
    defId: 'wall-sconce',
    position: [2.3, 0.3],
    rotation: 0,
    props: { mountHeight: 1.45 },
  },
  // ── Set-dressing decor props ─────────────────────────────────────────────
  // Small desk plant on the east nightstand surface (h=0.52 m).
  {
    id: 'default-main-decor-plant',
    defId: 'desk-plant',
    position: [2.73, 0.45],
    rotation: 0,
    props: { surfaceHeight: 0.52, type: 'succulent', potColor: '#c49a72', leafColor: '#4a8a54' },
  },
  // Throw cushion propped against the headboard on the bed (seat h ≈ 0.46 m).
  {
    id: 'default-main-decor-cushion',
    defId: 'throw-cushion',
    position: [1.7, 0.85],
    rotation: 0,
    props: { surfaceHeight: 0.46, color: '#b09090', accentColor: '#7a6060', shape: 'rect' },
  },
  // Throw blanket folded at the foot of the bed.
  {
    id: 'default-main-decor-blanket',
    defId: 'throw-blanket',
    position: [1.7, 1.95],
    rotation: 0,
    props: { surfaceHeight: 0.46, color: '#c8b49a', pattern: 'herringbone' },
  },
]
