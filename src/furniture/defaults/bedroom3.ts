import type { LayoutEntry } from './types'

/** Bedroom 3 — interior origin (6.10, 0.20), 2.85 × 3.40 m.
 *  RM4 refresh: a STUDY / FLEXI room — a single bed doubling as a daybed on the
 *  north wall, a work desk + office chair + monitor along the SOUTH wall (east of
 *  the door, clear of the swing) with a bookshelf on the east wall. The flexible
 *  home-office room modern SG 4-room buyers ask for. */
export const bedroom3: LayoutEntry[] = [
  {
    // Single bed as a daybed, headboard on the north wall.
    id: 'default-b3-bed-single',
    defId: 'bed-single',
    position: [6.9, 1.2],
    rotation: 0,
    props: {},
  },
  {
    // Desk on the south wall, east of the door (clear of its swing).
    id: 'default-b3-desk',
    defId: 'desk',
    position: [8.0, 3.3],
    rotation: 0,
    props: { width: 1.2, depth: 0.55 },
  },
  {
    id: 'default-b3-chair',
    defId: 'office-chair',
    position: [8.0, 2.65],
    rotation: 0,
    props: {},
  },
  {
    id: 'default-b3-monitor',
    defId: 'monitor',
    position: [8.0, 3.18],
    rotation: Math.PI,
    props: { screen: 'on' },
  },
  {
    // Bookshelf on the east wall, NE corner (small footprint — no cross-wall pinch).
    id: 'default-b3-bookshelf',
    defId: 'bookshelf',
    position: [8.8, 1.2],
    rotation: -Math.PI / 2,
    props: { width: 0.9, height: 1.6 },
  },
  {
    id: 'default-b3-plant',
    defId: 'potted-plant',
    position: [6.4, 2.5],
    rotation: 0,
    props: { size: 'small' },
  },
  {
    id: 'default-b3-rug',
    defId: 'rug',
    position: [7.3, 2.2],
    rotation: 0,
    props: { width: 1.6, depth: 1.0, color: '#7e8a86', borderColor: '#566460' },
  },
  {
    id: 'default-b3-art',
    defId: 'wall-art',
    position: [6.14, 1.5],
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
  // ── Set-dressing decor props ─────────────────────────────────────────────
  // Book stack on the desk surface (h=0.74 m) — study vibe.
  {
    id: 'default-b3-decor-books',
    defId: 'book-stack',
    position: [7.6, 3.22],
    rotation: 0,
    props: { surfaceHeight: 0.74, spineColor: '#7a4028', accentColor: '#3b5a6b' },
  },
  // Small plant on the desk.
  {
    id: 'default-b3-decor-plant',
    defId: 'desk-plant',
    position: [8.4, 3.22],
    rotation: 0,
    props: { surfaceHeight: 0.74, type: 'trailing', potColor: '#b89070', leafColor: '#5a9a4a' },
  },
  // Small sculpture on top of the bookshelf (h=1.6 m) — accent piece.
  {
    id: 'default-b3-decor-sculpture',
    defId: 'small-sculpture',
    position: [8.78, 0.95],
    rotation: -Math.PI / 2,
    props: { surfaceHeight: 1.6, style: 'sphere', color: '#c8b08a', finish: 'gloss' },
  },
]
