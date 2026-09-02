import type { LayoutPreset } from './types'

/**
 * NEW (RM2, 2026-07-19): "Modern Luxe / Quiet Luxury" — ivory + taupe +
 * chocolate, brass-toned metal accents where a def exposes a tintable metal
 * part, lacquered/gloss finishes, a fluted feature wall. Fabric stays within
 * the existing material vocabulary (fabric/velvet) — no bouclé material was
 * added; velvet + a soft taupe reads closest to it.
 */
export const modernLuxe: LayoutPreset = {
  id: 'modern-luxe',
  group: 'theme',
  name: 'Modern Luxe',
  // "Satin", not "lacquered": the preset's own `sheen: 0.3` is semi-matte, and
  // the quiet-luxury references are explicit that the look is matte/semi-matte
  // with UNLACQUERED brass (a patina that cannot be faked). The old wording
  // described high-gloss glam — the opposite style — and is user-facing in the
  // scheme comparison. See `docs/research/2026-09-02-scheme-theme-grounding.md`.
  description: 'Ivory, taupe & chocolate — brass accents, satin finishes, quiet luxury.',
  dryFloor: 'floor-wood-walnut',
  wall: 'wall-paint-warm',
  paletteId: 'modern-luxe',
  style: {
    'sofa-3seat': {
      color: '#b8a894',
      material: 'velvet',
      sheen: 0.3,
      pattern: 'plain',
      pillowColor: '#4b3a2f',
    },
    armchair: { color: '#4b3a2f', material: 'velvet', sheen: 0.3, style: 'tub' },
    'dining-chair': { style: 'upholstered', seatColor: '#b8a894' },
    rug: { color: '#e8e0d2', borderColor: '#b8a894', pattern: 'plain' },
    'coffee-table': { color: '#4b3a2f', finish: 'gloss' },
    'side-table': { topColor: '#4b3a2f', finish: 'gloss', shape: 'drum' },
    'dining-table-4': { topColor: '#4b3a2f', legColor: '#b8975e', finish: 'gloss' },
    'bed-queen': {
      frameColor: '#4b3a2f',
      beddingColor: '#f2ede4',
      headboardStyle: 'upholstered',
      pillowColor: '#b8a894',
    },
    'bed-single': { frameColor: '#4b3a2f', beddingColor: '#f2ede4' },
    'bed-double': { frameColor: '#4b3a2f', beddingColor: '#f2ede4' },
    nightstand: { color: '#4b3a2f' },
    dresser: { color: '#4b3a2f', handle: 'bar', finish: 'gloss' },
    bookshelf: { color: '#4b3a2f', finish: 'gloss' },
    desk: { color: '#4b3a2f', legStyle: 'panel', finish: 'gloss' },
    'tv-console': { color: '#4b3a2f', base: 'plinth', finish: 'gloss' },
    'wardrobe-3door': { color: '#f2ede4', doorStyle: 'sliding' },
    curtains: { color: '#e8e0d2' },
  },
  // Living gets the statement chocolate + brass pieces; bedrooms stay ivory
  // and taupe only — no chocolate casegoods, calmer than the living room
  // under the same theme (RM2 categoryStyle > style).
  categoryStyle: {
    bedroom: {
      'bed-queen': { frameColor: '#b8a894', beddingColor: '#f2ede4', pillowColor: '#e8e0d2' },
      nightstand: { color: '#b8a894' },
      dresser: { color: '#b8a894' },
    },
    masterBedroom: {
      'bed-queen': { frameColor: '#b8a894', beddingColor: '#f2ede4', pillowColor: '#e8e0d2' },
      nightstand: { color: '#b8a894' },
      dresser: { color: '#b8a894' },
    },
    living: {
      'sofa-3seat': { pillowColor: '#4b3a2f' },
    },
  },
  extraItems: [
    {
      id: 'modern-luxe-feature',
      defId: 'feature-wall',
      position: [12.53, 2.45],
      rotation: -Math.PI / 2,
      props: { width: 3.0, height: 2.55, style: 'fluted', color: '#4b3a2f', finish: 'wood' },
    },
  ],
}
