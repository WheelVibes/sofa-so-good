import { CURTAIN_SILL_STANDOFF } from '../placement/windowSnap'
import type { LayoutEntry } from './types'

/** Main bedroom — interior main body [0.20,0.20]→[3.28,3.725] (3.08 × 3.525 m),
 *  plus an open foyer extension [0.20,3.725]→[3.425,4.825] to the south (kept
 *  clear — it's shared circulation to the MB door + the bath1 door, no
 *  furniture placed there). The room's ONLY window is the north one, glass
 *  x=[0.80,2.60] (sill 0.95) — the west wall is solid. Centred queen bed under
 *  the north window flanked by TWO matching nightstands, a sliding 3-door wardrobe on
 *  the east partition wall (south portion, clear of the open foyer walkway),
 *  reading sconces flanking the window (MB-SCONCE-FLANK) rather than over the
 *  bed head, so the drawn curtain and the glass never foul them. */
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
  // Pulled OUTBOARD to x 0.475 / 2.925 so they clear the curtain's x span
  // (CURTAIN-NIGHTSTAND, v0.31.5.87). The curtain hangs at z 0.48-0.58 and the
  // north interior wall is at z 0.20, so a 0.40-deep nightstand against that wall
  // always reaches z >= 0.60 — there is NO z placement that avoids the panel, which
  // is why `.61` found the only z fix was 0.33 m out into the room. The clearance
  // is therefore taken in x instead, paired with the narrower curtain below.
  {
    id: 'default-main-nightstand-l',
    defId: 'nightstand',
    position: [0.475, 0.45],
    rotation: 0,
    props: {},
  },
  {
    id: 'default-main-nightstand',
    defId: 'nightstand',
    position: [2.925, 0.45],
    rotation: 0,
    props: {},
  },
  {
    id: 'default-main-tablelamp-l',
    defId: 'table-lamp',
    position: [0.475, 0.45],
    rotation: 0,
    props: { surfaceHeight: 0.52 },
  },
  {
    id: 'default-main-tablelamp',
    defId: 'table-lamp',
    position: [2.925, 0.45],
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
    // Width 1.9 (x 0.75-2.65), not 2.2: at 2.2 the panel spanned x 0.6-2.8 and
    // overhung both nightstands, cutting a notch out of the lamp shades. 1.9 still
    // covers the glass with ~0.05 of overhang each side (CURTAIN-NIGHTSTAND).
    id: 'default-main-curtain',
    defId: 'curtains',
    position: [1.7, 0.28],
    rotation: 0,
    props: {
      width: 1.9,
      height: 2.55,
      color: '#c8bca8',
      standoff: CURTAIN_SILL_STANDOFF,
      drawAmount: 0,
    },
  },
  // Reading sconces FLANKING the window on the north wall (MB-SCONCE-FLANK).
  // The old x 1.1/2.3 hung both bodies directly over the glass (x 0.8-2.6) and,
  // with the curtain flush (CURTAIN-FLUSH), the drawn drape fouled them by
  // 0.063 m. Moved symmetric about the curtain's own centre (x 1.7) to outside
  // the glass + frame + the curtain's own footprint edges (x 0.75/2.65 for the
  // 1.9 m-wide panel, incl. the open-state bunch, which sits at those same
  // outer edges): x 0.5 / 2.9, each clearing its nearest curtain edge by
  // 0.18 m (measured off the sconce's own 0.14 m body, not just its centre —
  // `scripts/dev-probes/curtain-clearance.mjs`'s `otherMount` column) and both
  // >= 0.12 m off the room's side walls (x 0.2/3.28). Same mountHeight/rotation.
  {
    id: 'default-main-sconce-l',
    defId: 'wall-sconce',
    position: [0.5, 0.3],
    rotation: 0,
    props: { mountHeight: 1.45 },
  },
  {
    id: 'default-main-sconce-r',
    defId: 'wall-sconce',
    position: [2.9, 0.3],
    rotation: 0,
    props: { mountHeight: 1.45 },
  },
  // ── Set-dressing decor props ─────────────────────────────────────────────
  // Small desk plant on the east nightstand surface (h=0.52 m).
  {
    id: 'default-main-decor-plant',
    defId: 'desk-plant',
    position: [2.925, 0.45],
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
