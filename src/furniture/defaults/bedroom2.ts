import type { LayoutEntry } from './types'

/** Bedroom 2 — interior origin (3.15, 0.20), 2.85 × 3.40 m.
 *  Single bed along the east-side wall, desk against the south wall. */
export const bedroom2: LayoutEntry[] = [
  {
    id: 'default-b2-bed-single',
    defId: 'bed-single',
    position: [4.1, 1.2],
    rotation: 0,
    props: {},
  },
  {
    id: 'default-b2-desk',
    defId: 'desk',
    position: [4.55, 3.2],
    rotation: 0,
    props: { width: 1.2, depth: 0.55 },
  },
  { id: 'default-b2-chair', defId: 'office-chair', position: [4.55, 2.55], rotation: 0, props: {} },
  {
    id: 'default-b2-monitor',
    defId: 'monitor',
    position: [4.55, 3.08],
    rotation: Math.PI,
    props: { screen: 'on' },
  },
  {
    id: 'default-b2-nightstand',
    defId: 'nightstand',
    position: [5.55, 0.65],
    rotation: 0,
    props: {},
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
  // Floating shelf over the desk on the south wall (faces into the room).
  {
    id: 'default-b2-shelf',
    defId: 'wall-shelf',
    position: [4.55, 3.55],
    rotation: Math.PI,
    props: { width: 1.0, depth: 0.2, mountHeight: 1.45 },
  },
  // ── Set-dressing decor props ─────────────────────────────────────────────
  // Book stack on the desk surface (h=0.74 m) — study room vibe.
  {
    id: 'default-b2-decor-books',
    defId: 'book-stack',
    position: [4.95, 3.12],
    rotation: 0.1,
    props: { surfaceHeight: 0.74, spineColor: '#7a4028', accentColor: '#3b5a6b' },
  },
  // Small desk plant on the other side of the desk.
  {
    id: 'default-b2-decor-plant',
    defId: 'desk-plant',
    position: [4.18, 3.12],
    rotation: 0,
    props: { surfaceHeight: 0.74, type: 'trailing', potColor: '#b89070', leafColor: '#5a9a4a' },
  },
  // Photo frames on the wall shelf (mountHeight=1.45, shelf surface at ≈1.60 m).
  {
    id: 'default-b2-decor-frames',
    defId: 'photo-frame-cluster',
    position: [4.55, 3.48],
    rotation: Math.PI,
    props: { surfaceHeight: 1.6, frameColor: '#2c2420', finish: 'wood' },
  },
]
