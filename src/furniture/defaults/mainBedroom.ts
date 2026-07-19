import type { LayoutEntry } from './types'

/** Main bedroom — interior origin (0.20, 0.20), 2.85 × 3.40 m.
 *  RM4 refresh: a centred queen flanked by TWO matching nightstands (the modern
 *  SG master norm), a sliding 3-door wardrobe along the east wall (no swing
 *  clearance needed in a tight room), reading sconces over the bed head. */
export const mainBedroom: LayoutEntry[] = [
  {
    id: 'default-main-bed-queen',
    defId: 'bed-queen',
    position: [1.5, 1.2],
    rotation: 0,
    props: {},
  },
  {
    // Sliding doors — no swing clearance needed in a tight bedroom. South
    // portion of the east wall, clear of the NE nightstand.
    id: 'default-main-wardrobe',
    defId: 'wardrobe-3door',
    position: [2.75, 2.0],
    rotation: -Math.PI / 2,
    props: { width: 1.4, doorStyle: 'sliding' },
  },
  // Matching nightstands flanking the bed head against the north wall.
  {
    id: 'default-main-nightstand-l',
    defId: 'nightstand',
    position: [0.47, 0.45],
    rotation: 0,
    props: {},
  },
  {
    id: 'default-main-nightstand',
    defId: 'nightstand',
    position: [2.53, 0.45],
    rotation: 0,
    props: {},
  },
  {
    id: 'default-main-tablelamp-l',
    defId: 'table-lamp',
    position: [0.47, 0.45],
    rotation: 0,
    props: { surfaceHeight: 0.52 },
  },
  {
    id: 'default-main-tablelamp',
    defId: 'table-lamp',
    position: [2.53, 0.45],
    rotation: 0,
    props: { surfaceHeight: 0.52 },
  },
  { id: 'default-main-lamp', defId: 'floor-lamp', position: [0.55, 3.2], rotation: 0, props: {} },
  {
    id: 'default-main-rug',
    defId: 'rug',
    position: [1.5, 2.7],
    rotation: 0,
    props: { width: 1.7, depth: 1.1, color: '#8f857a', borderColor: '#5f574c' },
  },
  {
    id: 'default-main-pendant',
    defId: 'ceiling-light',
    position: [1.5, 2.4],
    rotation: 0,
    props: { style: 'flush' },
  },
  {
    id: 'default-main-curtain',
    defId: 'curtains',
    position: [0.28, 2.2],
    rotation: Math.PI / 2,
    props: { width: 2.3, height: 2.3, color: '#c8bca8' },
  },
  // Reading sconces flanking the bed on the north wall.
  {
    id: 'default-main-sconce-l',
    defId: 'wall-sconce',
    position: [0.9, 0.3],
    rotation: 0,
    props: { mountHeight: 1.45 },
  },
  {
    id: 'default-main-sconce-r',
    defId: 'wall-sconce',
    position: [2.1, 0.3],
    rotation: 0,
    props: { mountHeight: 1.45 },
  },
  // ── Set-dressing decor props ─────────────────────────────────────────────
  // Small desk plant on the east nightstand surface (h=0.52 m).
  {
    id: 'default-main-decor-plant',
    defId: 'desk-plant',
    position: [2.53, 0.45],
    rotation: 0,
    props: { surfaceHeight: 0.52, type: 'succulent', potColor: '#c49a72', leafColor: '#4a8a54' },
  },
  // Throw cushion propped against the headboard on the bed (seat h ≈ 0.46 m).
  {
    id: 'default-main-decor-cushion',
    defId: 'throw-cushion',
    position: [1.5, 0.85],
    rotation: 0,
    props: { surfaceHeight: 0.46, color: '#b09090', accentColor: '#7a6060', shape: 'rect' },
  },
  // Throw blanket folded at the foot of the bed.
  {
    id: 'default-main-decor-blanket',
    defId: 'throw-blanket',
    position: [1.5, 1.95],
    rotation: 0,
    props: { surfaceHeight: 0.46, color: '#c8b49a', pattern: 'herringbone' },
  },
]
