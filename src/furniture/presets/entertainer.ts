import type { LayoutPreset } from './types'

export const entertainer: LayoutPreset = {
  id: 'entertainer',
  group: 'layout',
  name: "Entertainer's Lounge",
  description: 'Re-modelled L/D: L-sofa to a media credenza + bar cart, six-seat dining.',
  dryFloor: 'floor-wood-walnut',
  wall: 'wall-paint-greige',
  style: {},
  // Room geometry (2026-07-23 default-flat revision): as in openLounge, the
  // east wall now carries the L/D's main window, so the media
  // credenza/TV move to the household-shelter wall (x=8.365 face —
  // thickened to 300 mm RC in v0.23.1.8, moving the face 8.265→8.365).
  // The WHOLE lounge cluster (sectional/rug/coffee/feature/credenza/tv/
  // cove/fan) is shifted +0.1 m east from its pre-v0.23.1.8 position —
  // matching the wall's uniform thickening — so every piece's spacing to
  // its neighbours is preserved exactly. z=[4.925,6.775]) and dining moves
  // to the window-lit north strip (x>=9.225). Sectional now faces west
  // (was east, mirrored).
  livingDining: [
    // ── Lounge zone (south band + SE foyer): sectional faces the west
    // media wall ──
    {
      id: 'es-sectional',
      defId: 'sofa-lshape',
      position: [11.5, 5.6],
      rotation: Math.PI / 2,
      props: {
        width: 2.6,
        depth: 0.95,
        chaise: 1.0,
        chaiseSide: 'left',
        color: '#4a5a63',
        material: 'fabric',
        pattern: 'plain',
        pillowColor: '#c9a24b',
      },
    },
    {
      id: 'es-rug',
      defId: 'rug',
      position: [10.6, 5.85],
      rotation: 0,
      props: {
        width: 2.2,
        depth: 2.6,
        color: '#cfc6b4',
        borderColor: '#3a352c',
        pattern: 'plain',
      },
    },
    {
      id: 'es-coffee',
      defId: 'coffee-table',
      position: [9.9, 5.85],
      rotation: 0,
      props: { shape: 'oval', width: 1.0, depth: 0.55, color: '#3f2f22', finish: 'wood' },
    },
    {
      id: 'es-feature',
      defId: 'feature-wall',
      position: [8.39, 5.85],
      rotation: Math.PI / 2,
      props: { width: 1.8, height: 2.55, style: 'slat', color: '#4a3a2c', finish: 'wood' },
    },
    // Media credenza — a long sideboard under the wall-mounted TV.
    {
      id: 'es-credenza',
      defId: 'sideboard',
      position: [8.615, 5.85],
      rotation: Math.PI / 2,
      props: {
        width: 1.6,
        depth: 0.42,
        bays: 4,
        front: 'mixed',
        legs: 'tapered',
        handle: 'bar',
        color: '#4a3a2c',
        finish: 'wood',
      },
    },
    {
      id: 'es-tv',
      defId: 'tv-wall',
      position: [8.45, 5.85],
      rotation: Math.PI / 2,
      props: {
        size: '65',
        mount: 'wall',
        mountHeight: 1.35,
        screen: 'on',
        screenContent: 'sunset',
      },
    },
    {
      id: 'es-cove',
      defId: 'cove-light',
      position: [8.41, 5.85],
      rotation: Math.PI / 2,
      props: { length: 1.6, mountHeight: 2.38 },
    },
    // Bar cart, tucked east of the dining table in the window-lit north strip.
    {
      id: 'es-barcart',
      defId: 'bar-cart',
      position: [12.1, 3.5],
      rotation: 0,
      props: { tiers: 3, frame: 'brass', shelf: 'glass' },
    },
    {
      id: 'es-plant',
      defId: 'potted-plant',
      position: [12.2, 1.6],
      rotation: 0,
      props: { type: 'fiddle', size: 'large', potShape: 'cylinder', leafColor: '#3f7a3f' },
    },
    {
      id: 'es-lamp',
      defId: 'floor-lamp',
      position: [11.0, 7.6],
      rotation: 0,
      props: { base: 'tripod', shade: 'drum' },
    },
    { id: 'es-fan', defId: 'ceiling-fan', position: [10.6, 5.85], rotation: 0, props: {} },
    { id: 'es-aircon', defId: 'aircon-unit', position: [10.6, 1.4], rotation: 0, props: {} },
    {
      id: 'es-curtain',
      defId: 'curtains',
      position: [10.82, 1.42],
      rotation: 0,
      props: { width: 2.8, height: 2.55, color: '#cfc6b4' },
    },
    // ── Dining zone (north strip, window-lit), open to the lounge ──
    {
      id: 'es-dining',
      defId: 'dining-table-4',
      position: [10.7, 2.5],
      rotation: 0,
      props: { seats: '6', shape: 'oval', topColor: '#3f2f22', legColor: '#2c2118' },
    },
    {
      id: 'es-dc-n1',
      defId: 'dining-chair',
      position: [9.95, 1.8],
      rotation: 0,
      props: { style: 'upholstered', seatColor: '#4a5a63' },
    },
    {
      id: 'es-dc-n2',
      defId: 'dining-chair',
      position: [10.7, 1.8],
      rotation: 0,
      props: { style: 'upholstered', seatColor: '#4a5a63' },
    },
    {
      id: 'es-dc-n3',
      defId: 'dining-chair',
      position: [11.45, 1.8],
      rotation: 0,
      props: { style: 'upholstered', seatColor: '#4a5a63' },
    },
    {
      id: 'es-dc-s1',
      defId: 'dining-chair',
      position: [9.95, 3.2],
      rotation: Math.PI,
      props: { style: 'upholstered', seatColor: '#4a5a63' },
    },
    {
      id: 'es-dc-s2',
      defId: 'dining-chair',
      position: [10.7, 3.2],
      rotation: Math.PI,
      props: { style: 'upholstered', seatColor: '#4a5a63' },
    },
    {
      id: 'es-dc-s3',
      defId: 'dining-chair',
      position: [11.45, 3.2],
      rotation: Math.PI,
      props: { style: 'upholstered', seatColor: '#4a5a63' },
    },
    {
      id: 'es-pendant',
      defId: 'ceiling-light',
      position: [10.7, 2.5],
      rotation: 0,
      props: { style: 'pendant', shade: 'drum' },
    },
    {
      // Nudged west 0.03 m (v0.23.2.0): the east wall's SE structural
      // segment (`wall-ext-E-col2`, z=[6.5,8.235]) thickened to 300 mm —
      // its interior face moved 12.525→12.475, clipping this cabinet's old
      // flush back edge (12.5) by 0.025 m. New back edge 12.47, clear.
      id: 'es-shoe',
      defId: 'shoe-cabinet',
      position: [12.32, 7.55],
      rotation: -Math.PI / 2,
      props: { width: 0.9, depth: 0.3 },
    },
  ],
}
