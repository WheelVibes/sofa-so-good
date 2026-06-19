import type { LayoutEntry } from './types'

/** Main bedroom — interior origin (0.20, 0.20), 2.85 × 3.40 m.
 *  Queen bed against north wall, wardrobe rotated against east wall. */
export const mainBedroom: LayoutEntry[] = [
  {
    id: 'default-main-bed-queen',
    defId: 'bed-queen',
    position: [1.05, 1.3],
    rotation: 0,
    props: {},
  },
  {
    // Sliding doors — no swing clearance needed in a tight bedroom.
    id: 'default-main-wardrobe',
    defId: 'wardrobe-3door',
    position: [2.7, 1.9],
    rotation: -Math.PI / 2,
    props: { width: 1.4, doorStyle: 'sliding' },
  },
  {
    id: 'default-main-nightstand',
    defId: 'nightstand',
    position: [2.05, 0.75],
    rotation: 0,
    props: {},
  },
  {
    id: 'default-main-tablelamp',
    defId: 'table-lamp',
    position: [2.05, 0.75],
    rotation: 0,
    props: { surfaceHeight: 0.52 },
  },
  { id: 'default-main-lamp', defId: 'floor-lamp', position: [0.6, 3.15], rotation: 0, props: {} },
  {
    id: 'default-main-rug',
    defId: 'rug',
    position: [1.4, 2.85],
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
    position: [0.45, 0.3],
    rotation: 0,
    props: { mountHeight: 1.45 },
  },
  {
    id: 'default-main-sconce-r',
    defId: 'wall-sconce',
    position: [1.65, 0.3],
    rotation: 0,
    props: { mountHeight: 1.45 },
  },
  // ── Set-dressing decor props ─────────────────────────────────────────────
  // Small desk plant on the nightstand surface (h=0.52 m).
  {
    id: 'default-main-decor-plant',
    defId: 'desk-plant',
    position: [2.05, 0.75],
    rotation: 0,
    props: { surfaceHeight: 0.52, type: 'succulent', potColor: '#c49a72', leafColor: '#4a8a54' },
  },
  // Throw cushion propped against the headboard on the bed (seat h ≈ 0.46 m).
  {
    id: 'default-main-decor-cushion',
    defId: 'throw-cushion',
    position: [0.7, 0.88],
    rotation: 0,
    props: { surfaceHeight: 0.46, color: '#b09090', accentColor: '#7a6060', shape: 'rect' },
  },
  // Throw blanket folded at the foot of the bed.
  {
    id: 'default-main-decor-blanket',
    defId: 'throw-blanket',
    position: [1.05, 2.0],
    rotation: 0,
    props: { surfaceHeight: 0.46, color: '#c8b49a', pattern: 'herringbone' },
  },
]
