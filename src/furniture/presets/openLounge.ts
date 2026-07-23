import type { LayoutPreset } from './types'

export const openLounge: LayoutPreset = {
  id: 'open-lounge',
  group: 'layout',
  name: 'Open-Concept Lounge',
  description: 'Re-modelled L/D: L-sectional facing a media wall, open dining.',
  dryFloor: 'floor-wood-oak',
  wall: 'wall-paint-greige',
  style: {},
  // Room geometry (2026-07-23 default-flat revision): the EAST wall now
  // carries the L/D's main window (low-sill, z=[2.95,6.35]), so the media
  // wall — previously mounted there — moves to the one solid, windowless
  // wall available near the seating: the household-shelter wall,
  // x=8.365 face (thickened to 300 mm RC in v0.23.1.8, moving the face
  // 8.265→8.365). The WHOLE lounge cluster (sectional/rug/coffee/feature/
  // media/tv/cove/fan) is shifted +0.1 m east from its pre-v0.23.1.8
  // position — matching the wall's uniform thickening — so every piece's
  // spacing to its neighbours is preserved exactly; only the media wall
  // moved, not the room's contents relative to each other. z=[4.925,6.775]
  // (open-plan south band + the enlarged SE foyer extension south of it, no
  // partition). Dining moves to the
  // window-lit NORTH strip instead (x>=9.225, clear of the bedroom3/corridor
  // walls to its west) — a bright breakfast-table spot, and it no longer
  // competes with the lounge for depth along the shelter wall. Sofa
  // faces west (was east, mirrored) toward the relocated media wall.
  livingDining: [
    // ── Lounge zone (south band + SE foyer), seating faces the west
    // (household-shelter) media wall ──
    {
      id: 'ol-sectional',
      defId: 'sofa-lshape',
      position: [11.5, 5.6],
      rotation: Math.PI / 2,
      props: {
        width: 2.6,
        depth: 0.95,
        chaise: 1.0,
        chaiseSide: 'left',
        color: '#6f7a74',
        material: 'fabric',
        pattern: 'herringbone',
        pillowColor: '#c4683f',
      },
    },
    {
      id: 'ol-rug',
      defId: 'rug',
      position: [10.6, 5.85],
      rotation: 0,
      props: {
        width: 2.2,
        depth: 2.6,
        color: '#cfc6b4',
        borderColor: '#5a4a32',
        pattern: 'plain',
      },
    },
    {
      id: 'ol-coffee',
      defId: 'coffee-table',
      position: [9.9, 5.85],
      rotation: 0,
      props: { shape: 'oval', width: 1.0, depth: 0.55, color: '#5a3f2a', finish: 'wood' },
    },
    {
      id: 'ol-feature',
      defId: 'feature-wall',
      position: [8.39, 5.85],
      rotation: Math.PI / 2,
      props: { width: 1.8, height: 2.55, style: 'fluted', color: '#6f553f', finish: 'wood' },
    },
    {
      id: 'ol-media',
      defId: 'tv-console',
      position: [8.615, 5.85],
      rotation: Math.PI / 2,
      props: { width: 1.6, base: 'legs', front: 'doors', color: '#4a3a2c', finish: 'wood' },
    },
    {
      id: 'ol-tv',
      defId: 'tv-wall',
      position: [8.45, 5.85],
      rotation: Math.PI / 2,
      props: {
        size: '65',
        mount: 'wall',
        mountHeight: 1.3,
        screen: 'on',
        screenContent: 'landscape',
      },
    },
    {
      id: 'ol-cove',
      defId: 'cove-light',
      position: [8.41, 5.85],
      rotation: Math.PI / 2,
      props: { length: 1.6, mountHeight: 2.38 },
    },
    {
      id: 'ol-plant',
      defId: 'potted-plant',
      position: [12.2, 1.6],
      rotation: 0,
      props: { type: 'fiddle', size: 'large', potShape: 'square', leafColor: '#3f7a3f' },
    },
    {
      id: 'ol-lamp',
      defId: 'floor-lamp',
      position: [11.0, 7.6],
      rotation: 0,
      props: { base: 'tripod', shade: 'drum' },
    },
    { id: 'ol-fan', defId: 'ceiling-fan', position: [10.6, 5.85], rotation: 0, props: {} },
    { id: 'ol-aircon', defId: 'aircon-unit', position: [10.6, 1.4], rotation: 0, props: {} },
    // ── Dining zone (north strip, window-lit), open to the lounge ──
    {
      id: 'ol-curtain',
      defId: 'curtains',
      position: [10.82, 1.42],
      rotation: 0,
      props: { width: 2.8, height: 2.55, color: '#cfc6b4' },
    },
    {
      id: 'ol-dining',
      defId: 'dining-table-4',
      position: [10.7, 2.5],
      rotation: 0,
      props: { seats: '6', shape: 'oval', topColor: '#5a3f2a', legColor: '#3a2c1d' },
    },
    {
      id: 'ol-dc-n1',
      defId: 'dining-chair',
      position: [9.95, 1.8],
      rotation: 0,
      props: { style: 'upholstered', seatColor: '#8a7f70' },
    },
    {
      id: 'ol-dc-n2',
      defId: 'dining-chair',
      position: [10.7, 1.8],
      rotation: 0,
      props: { style: 'upholstered', seatColor: '#8a7f70' },
    },
    {
      id: 'ol-dc-n3',
      defId: 'dining-chair',
      position: [11.45, 1.8],
      rotation: 0,
      props: { style: 'upholstered', seatColor: '#8a7f70' },
    },
    {
      id: 'ol-dc-s1',
      defId: 'dining-chair',
      position: [9.95, 3.2],
      rotation: Math.PI,
      props: { style: 'upholstered', seatColor: '#8a7f70' },
    },
    {
      id: 'ol-dc-s2',
      defId: 'dining-chair',
      position: [10.7, 3.2],
      rotation: Math.PI,
      props: { style: 'upholstered', seatColor: '#8a7f70' },
    },
    {
      id: 'ol-dc-s3',
      defId: 'dining-chair',
      position: [11.45, 3.2],
      rotation: Math.PI,
      props: { style: 'upholstered', seatColor: '#8a7f70' },
    },
    {
      id: 'ol-pendant',
      defId: 'ceiling-light',
      position: [10.7, 2.5],
      rotation: 0,
      props: { style: 'pendant', shade: 'drum' },
    },
    // ── Entry alcove (SE foyer): shoe storage only — kept clear for the door. ──
    {
      // Nudged west 0.03 m (v0.23.2.0): the east wall's SE structural
      // segment (`wall-ext-E-col2`, z=[6.5,8.235]) thickened to 300 mm —
      // its interior face moved 12.525→12.475, clipping this cabinet's old
      // flush back edge (12.5) by 0.025 m. New back edge 12.47, clear.
      id: 'ol-shoe',
      defId: 'shoe-cabinet',
      position: [12.32, 7.55],
      rotation: -Math.PI / 2,
      props: { width: 0.9, depth: 0.3 },
    },
  ],
  extraItems: [
    {
      id: 'ol-bench',
      defId: 'bench',
      position: [1.05, 2.55],
      rotation: 0,
      props: { style: 'storage', material: 'fabric', color: '#8a6b48', legColor: '#4a3722' },
    },
  ],
}
