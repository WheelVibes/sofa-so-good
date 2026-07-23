import { CURTAIN_SILL_STANDOFF } from '../placement/windowSnap'
import type { LayoutEntry } from './types'

/** Bedroom 3 — interior [6.24,0.20]→[9.125,3.725] (2.885 × 3.525 m). Window
 *  north x=[6.80,8.60]. Door in the south wall x=[6.38,7.18], swinging into
 *  the room toward the west partition.
 *  RM4 refresh: a STUDY / FLEXI room — a single bed doubling as a daybed on the
 *  north wall, a work desk + office chair + monitor along the SOUTH wall (east
 *  of the door, clear of the swing) with a bookshelf on the east wall. The
 *  flexible home-office room modern SG 4-room buyers ask for. */
export const bedroom3: LayoutEntry[] = [
  {
    // Single bed as a daybed, headboard on the north wall.
    id: 'default-b3-bed-single',
    defId: 'bed-single',
    position: [7.04, 1.2],
    rotation: 0,
    props: {},
  },
  {
    // Desk on the south wall, east of the door (clear of its swing).
    id: 'default-b3-desk',
    defId: 'desk',
    position: [8.175, 3.4],
    rotation: 0,
    props: { width: 1.2, depth: 0.55 },
  },
  {
    id: 'default-b3-chair',
    defId: 'office-chair',
    position: [8.175, 2.75],
    rotation: 0,
    props: {},
  },
  {
    id: 'default-b3-monitor',
    defId: 'monitor',
    position: [8.175, 3.28],
    rotation: Math.PI,
    props: { screen: 'on' },
  },
  {
    // Bookshelf on the east wall, NE corner (small footprint — no cross-wall
    // pinch). Nudged west 0.09 m (v0.23.1.8): its z-span [0.75,1.65] crosses
    // into `wall-int-b3-LD-col`'s stretch (z=[1.2,1.8]), which thickened to
    // 300 mm RC — the wall's face there moved 9.125 → 9.025, so the item's
    // old flush edge (9.075) now overlapped it by 0.05 m. (Nudged 0.01 m
    // short of the full 0.1 m offset so its gap to `default-ld-tv-console`
    // — on the OTHER side of that same wall, also nudged clear of it —
    // lands cleanly under the 0.4 m "intentional close spacing" threshold
    // instead of a hair over it, which the walkway checker was flagging as
    // a tight pinch.)
    id: 'default-b3-bookshelf',
    defId: 'bookshelf',
    position: [8.84, 1.2],
    rotation: -Math.PI / 2,
    props: { width: 0.9, height: 1.6 },
  },
  {
    id: 'default-b3-plant',
    defId: 'potted-plant',
    position: [6.54, 2.5],
    rotation: 0,
    props: { size: 'small' },
  },
  {
    id: 'default-b3-rug',
    defId: 'rug',
    position: [7.45, 2.2],
    rotation: 0,
    props: { width: 1.6, depth: 1.0, color: '#7e8a86', borderColor: '#566460' },
  },
  {
    id: 'default-b3-art',
    defId: 'wall-art',
    position: [6.28, 1.5],
    rotation: Math.PI / 2,
    props: { width: 0.7, height: 0.5, artColor: '#86a6b0' },
  },
  {
    id: 'default-b3-pendant',
    defId: 'ceiling-light',
    position: [7.66, 2.46],
    rotation: 0,
    props: { style: 'flush' },
  },
  // ── Set-dressing decor props ─────────────────────────────────────────────
  // Book stack on the desk surface (h=0.74 m) — study vibe.
  {
    id: 'default-b3-decor-books',
    defId: 'book-stack',
    position: [7.775, 3.32],
    rotation: 0,
    props: { surfaceHeight: 0.74, spineColor: '#7a4028', accentColor: '#3b5a6b' },
  },
  // Small plant on the desk.
  {
    id: 'default-b3-decor-plant',
    defId: 'desk-plant',
    position: [8.575, 3.32],
    rotation: 0,
    props: { surfaceHeight: 0.74, type: 'trailing', potColor: '#b89070', leafColor: '#5a9a4a' },
  },
  // Small sculpture on top of the bookshelf (h=1.6 m) — accent piece.
  {
    id: 'default-b3-decor-sculpture',
    defId: 'small-sculpture',
    // Nudged west 0.085 m with the bookshelf above (see its comment).
    position: [8.82, 0.95],
    rotation: -Math.PI / 2,
    props: { surfaceHeight: 1.6, style: 'sphere', color: '#c8b08a', finish: 'gloss' },
  },
  {
    // North (W1) window — glass x=[6.95,8.45], sill 0.55.
    id: 'default-b3-curtain',
    defId: 'curtains',
    position: [7.7, 0.28],
    rotation: 0,
    props: { width: 1.9, height: 2.55, color: '#c8bca8', standoff: CURTAIN_SILL_STANDOFF },
  },
]
