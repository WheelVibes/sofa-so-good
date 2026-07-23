import type { LayoutPreset } from './types'

export const brokenPlan: LayoutPreset = {
  id: 'broken-plan',
  group: 'layout',
  name: 'Broken-Plan Living',
  description:
    'Re-modelled L/D: a slat screen zones the lounge from the dining without closing it.',
  dryFloor: 'floor-wood-oak',
  wall: 'wall-paint-warm',
  style: {},
  // Room geometry (2026-07-23 default-flat revision): as in openLounge, the
  // east wall now carries the L/D's main window, so the media wall moves to
  // the household-shelter wall (x=8.365 face, z~[4.925,6.775] — thickened to
  // 300 mm RC in v0.23.1.8, moving the face 8.265→8.365). The WHOLE lounge
  // cluster (sofa/console/tv/soundbar/cove/rug/coffee/fan) is shifted
  // +0.1 m east from its pre-v0.23.1.8 position — matching the wall's
  // uniform thickening — so every piece's spacing to its neighbours is
  // preserved exactly. Dining moves to the window-lit north strip
  // (x>=9.225) — the zoning slat screen
  // stays at the SAME boundary (z=3.95) between them, just with lounge/dining
  // swapped sides (lounge now south, dining now north of the screen).
  livingDining: [
    // ── Lounge (south, HS wall + SE foyer), facing the west media wall ──
    {
      id: 'bp-sofa',
      defId: 'sofa-3seat',
      position: [10.7, 5.6],
      rotation: Math.PI / 2,
      props: { color: '#7d8a82', material: 'fabric', pattern: 'plain', pillowColor: '#b5683f' },
    },
    {
      id: 'bp-console',
      defId: 'tv-console',
      position: [8.615, 5.6],
      rotation: Math.PI / 2,
      props: { width: 1.6, base: 'legs', color: '#5a3f2a', finish: 'wood' },
    },
    {
      id: 'bp-tv',
      defId: 'tv-wall',
      position: [8.45, 5.6],
      rotation: Math.PI / 2,
      props: {
        size: '55',
        mount: 'wall',
        mountHeight: 1.3,
        screen: 'on',
        screenContent: 'landscape',
      },
    },
    {
      id: 'bp-soundbar',
      defId: 'soundbar',
      position: [8.5, 5.6],
      rotation: Math.PI / 2,
      props: { width: 1.2, mountHeight: 0.78, grille: 'fabric', color: '#1c1c1e' },
    },
    {
      id: 'bp-cove',
      defId: 'cove-light',
      position: [8.41, 5.6],
      rotation: Math.PI / 2,
      props: { length: 1.6, mountHeight: 2.38 },
    },
    {
      id: 'bp-rug',
      defId: 'rug',
      position: [10.0, 5.6],
      rotation: 0,
      props: {
        width: 2.0,
        depth: 1.8,
        color: '#d8cdb8',
        borderColor: '#9a8a6a',
        pattern: 'plain',
      },
    },
    {
      id: 'bp-coffee',
      defId: 'coffee-table',
      position: [9.6, 5.6],
      rotation: Math.PI / 2,
      props: { shape: 'oval', width: 1.0, depth: 0.55, color: '#5a3f2a', finish: 'wood' },
    },
    {
      id: 'bp-ottoman',
      defId: 'ottoman',
      position: [12.0, 6.45],
      rotation: 0,
      props: {
        shape: 'round',
        width: 0.5,
        depth: 0.5,
        color: '#b5683f',
        material: 'fabric',
        tufting: 'buttons',
      },
    },
    { id: 'bp-fan', defId: 'ceiling-fan', position: [10.0, 5.6], rotation: 0, props: {} },
    // ── The zoning screen between lounge and dining (partial width → walkway east) ──
    {
      id: 'bp-divider',
      defId: 'room-divider',
      position: [9.95, 3.95],
      rotation: 0,
      props: { width: 1.5, height: 1.8, style: 'slat', color: '#5a3f2a', finish: 'wood' },
    },
    // ── Dining (north strip, window-lit) ──
    { id: 'bp-aircon', defId: 'aircon-unit', position: [10.6, 1.4], rotation: 0, props: {} },
    {
      id: 'bp-curtain',
      defId: 'curtains',
      position: [10.82, 1.42],
      rotation: 0,
      props: { width: 2.8, height: 2.55, color: '#e6ddca' },
    },
    {
      id: 'bp-dining',
      defId: 'dining-table-4',
      position: [10.7, 2.5],
      rotation: 0,
      props: { seats: '6', shape: 'oval', topColor: '#5a3f2a', legColor: '#3a2c1d' },
    },
    {
      id: 'bp-dc-n1',
      defId: 'dining-chair',
      position: [9.95, 1.8],
      rotation: 0,
      props: { style: 'wood', seatColor: '#9a6b3f' },
    },
    {
      id: 'bp-dc-n2',
      defId: 'dining-chair',
      position: [10.7, 1.8],
      rotation: 0,
      props: { style: 'wood', seatColor: '#9a6b3f' },
    },
    {
      id: 'bp-dc-n3',
      defId: 'dining-chair',
      position: [11.45, 1.8],
      rotation: 0,
      props: { style: 'wood', seatColor: '#9a6b3f' },
    },
    {
      id: 'bp-dc-s1',
      defId: 'dining-chair',
      position: [9.95, 3.2],
      rotation: Math.PI,
      props: { style: 'wood', seatColor: '#9a6b3f' },
    },
    {
      id: 'bp-dc-s2',
      defId: 'dining-chair',
      position: [10.7, 3.2],
      rotation: Math.PI,
      props: { style: 'wood', seatColor: '#9a6b3f' },
    },
    {
      id: 'bp-dc-s3',
      defId: 'dining-chair',
      position: [11.45, 3.2],
      rotation: Math.PI,
      props: { style: 'wood', seatColor: '#9a6b3f' },
    },
    {
      id: 'bp-pendant',
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
      id: 'bp-shoe',
      defId: 'shoe-cabinet',
      position: [12.32, 7.55],
      rotation: -Math.PI / 2,
      props: { width: 0.9, depth: 0.3 },
    },
  ],
}
