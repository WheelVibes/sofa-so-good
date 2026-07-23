import type { LayoutPreset } from './types'

/**
 * RM2 retune (2026-07-19): "Minimalist" becomes "Warm Minimalist / Muji" —
 * oat/cream tones throughout, no harsh contrast (the living/dining
 * re-model + its low-furniture positions are unchanged).
 */
export const minimalist: LayoutPreset = {
  id: 'minimalist',
  group: 'theme',
  name: 'Warm Minimalist / Muji',
  description: 'Re-modelled L/D: oat & cream, low furniture, no harsh contrast.',
  dryFloor: 'floor-wood-ash',
  wall: 'wall-paint-soft-white',
  paletteId: 'scandi-calm',
  style: {
    'bed-queen': { frameColor: '#cdb696', beddingColor: '#f0ece2', headboardStyle: 'upholstered' },
    'bed-single': { frameColor: '#cdb696', beddingColor: '#f0ece2' },
    'bed-double': { frameColor: '#cdb696', beddingColor: '#f0ece2' },
    nightstand: { color: '#cdb696' },
    dresser: { color: '#cdb696' },
    bookshelf: { color: '#cdb696' },
    desk: { color: '#cdb696' },
    'wardrobe-3door': { color: '#e8e2d6' },
    curtains: { color: '#e6e0d2' },
  },
  // Bedrooms drop even the muted pillow accent the living rug/curtains carry —
  // an all-oat, no-pattern read (RM2 categoryStyle > style).
  categoryStyle: {
    bedroom: {
      'bed-queen': { pillowColor: '#f0ece2' },
    },
    masterBedroom: {
      'bed-queen': { pillowColor: '#f0ece2' },
    },
  },
  // Room geometry (2026-07-23 default-flat revision): as in openLounge, the
  // east wall now carries the L/D's main window, so the media wall moves to
  // the household-shelter wall (x=8.365 face, z~[4.925,6.775] — thickened to
  // 300 mm RC in v0.23.1.8, moving the face 8.265→8.365) and dining moves to
  // the window-lit north strip (x>=9.225). Sofa now faces west (was east)
  // toward the relocated media wall. The WHOLE lounge cluster (sofa/console/
  // tv/cove/rug/coffee/fan) is shifted +0.1 m east from its pre-v0.23.1.8
  // position — matching the wall's uniform thickening — so every piece's
  // spacing to its neighbours (which the console/coffee/sofa trio is snugly
  // tuned to, several right at the walkway checker's 0.4 m cutoff) is
  // preserved exactly; only the media wall moved, not the room's contents
  // relative to each other.
  livingDining: [
    {
      id: 'mn-sofa',
      defId: 'sofa-3seat',
      position: [10.7, 5.6],
      rotation: Math.PI / 2,
      props: { armStyle: 'low', color: '#dad7cf', material: 'fabric', accentPillows: 'none' },
    },
    {
      id: 'mn-console',
      defId: 'tv-console',
      position: [8.615, 5.6],
      rotation: Math.PI / 2,
      props: { width: 1.6, base: 'plinth', color: '#cdb696', finish: 'wood' },
    },
    {
      id: 'mn-tv',
      defId: 'tv-wall',
      position: [8.45, 5.6],
      rotation: Math.PI / 2,
      props: { size: '55', mount: 'wall', mountHeight: 1.3, screen: 'off' },
    },
    {
      id: 'mn-cove',
      defId: 'cove-light',
      position: [8.41, 5.6],
      rotation: Math.PI / 2,
      props: { length: 1.6, mountHeight: 2.38 },
    },
    {
      id: 'mn-rug',
      defId: 'rug',
      position: [10.0, 5.6],
      rotation: 0,
      props: {
        width: 2.0,
        depth: 1.8,
        color: '#e6e0d2',
        borderColor: '#d8cdb8',
        pattern: 'plain',
      },
    },
    {
      id: 'mn-coffee',
      defId: 'coffee-table',
      position: [9.6, 5.6],
      rotation: Math.PI / 2,
      props: { shape: 'oval', width: 1.0, depth: 0.55, color: '#cdb696', finish: 'wood' },
    },
    { id: 'mn-fan', defId: 'ceiling-fan', position: [10.0, 5.6], rotation: 0, props: {} },
    { id: 'mn-aircon', defId: 'aircon-unit', position: [10.6, 1.4], rotation: 0, props: {} },
    {
      id: 'mn-curtain',
      defId: 'curtains',
      position: [10.82, 1.42],
      rotation: 0,
      props: { width: 2.8, height: 2.55, color: '#e6e0d2' },
    },
    // ── Dining (window-lit north strip) ──
    {
      id: 'mn-dining',
      defId: 'dining-table-4',
      position: [10.7, 2.5],
      rotation: 0,
      props: { seats: '4', shape: 'round', topColor: '#cdb696', legColor: '#b39a72' },
    },
    {
      id: 'mn-dc-1',
      defId: 'dining-chair',
      position: [10.35, 1.75],
      rotation: 0,
      props: { style: 'wood', seatColor: '#cdb696' },
    },
    {
      id: 'mn-dc-2',
      defId: 'dining-chair',
      position: [11.05, 1.75],
      rotation: 0,
      props: { style: 'wood', seatColor: '#cdb696' },
    },
    {
      id: 'mn-dc-3',
      defId: 'dining-chair',
      position: [10.35, 3.25],
      rotation: Math.PI,
      props: { style: 'wood', seatColor: '#cdb696' },
    },
    {
      id: 'mn-dc-4',
      defId: 'dining-chair',
      position: [11.05, 3.25],
      rotation: Math.PI,
      props: { style: 'wood', seatColor: '#cdb696' },
    },
    {
      id: 'mn-pendant',
      defId: 'ceiling-light',
      position: [10.7, 2.5],
      rotation: 0,
      props: { style: 'pendant', shade: 'globe' },
    },
    {
      id: 'mn-plant',
      defId: 'potted-plant',
      position: [12.2, 6.3],
      rotation: 0,
      props: { type: 'snake', size: 'large', potShape: 'cylinder' },
    },
    {
      // Nudged west 0.03 m (v0.23.2.0): the east wall's SE structural
      // segment (`wall-ext-E-col2`, z=[6.5,8.235]) thickened to 300 mm —
      // its interior face moved 12.525→12.475, clipping this cabinet's old
      // flush back edge (12.5) by 0.025 m. New back edge 12.47, clear.
      id: 'mn-shoe',
      defId: 'shoe-cabinet',
      position: [12.32, 7.55],
      rotation: -Math.PI / 2,
      props: { width: 0.9, depth: 0.3 },
    },
  ],
}
