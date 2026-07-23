import type { LayoutPreset } from './types'

export const wfhStudio: LayoutPreset = {
  id: 'wfh-studio',
  group: 'layout',
  name: 'Work-From-Home',
  description: 'Re-modelled L/D: compact lounge, a study nook + shelving, round dining.',
  dryFloor: 'floor-wood-ash',
  wall: 'wall-paint-soft-white',
  style: {},
  // Room geometry (2026-07-23 default-flat revision): the east wall now
  // carries the L/D's main window, so the media wall moves to the
  // household-shelter wall (x=8.365 face — thickened to 300 mm RC in
  // v0.23.1.8, moving the face 8.265→8.365; every item below flush to it is
  // shifted +0.1 m from its pre-v0.23.1.8 position), z~[4.925,6.775] — the
  // ONLY span for both lounge AND desk to share is too short for both, so the compact
  // lounge takes it and the study nook moves to the OTHER windowless wall,
  // the bedroom3 partition (x=9.225 face, z=[1.3,3.775], plenty of room for
  // a desk + chair + shelf). Round dining stays in the SE alcove/foyer.
  livingDining: [
    // ── Compact lounge (south, HS wall), facing the west media wall ──
    {
      id: 'wfh-sofa',
      defId: 'sofa-2seat',
      position: [10.3, 5.6],
      rotation: -Math.PI / 2,
      props: {
        width: 1.6,
        depth: 0.9,
        color: '#8a9aa0',
        material: 'fabric',
        pattern: 'plain',
        pillowColor: '#3b5a7d',
      },
    },
    {
      id: 'wfh-rug',
      defId: 'rug',
      position: [9.8, 5.6],
      rotation: 0,
      props: {
        width: 1.7,
        depth: 1.7,
        color: '#dfd8c8',
        borderColor: '#5a4a32',
        pattern: 'striped',
      },
    },
    {
      id: 'wfh-coffee',
      defId: 'coffee-table',
      position: [9.3, 5.6],
      rotation: 0,
      props: { shape: 'round', width: 0.9, depth: 0.9, color: '#9a6b3f', finish: 'wood' },
    },
    {
      id: 'wfh-media',
      defId: 'tv-console',
      position: [8.615, 5.6],
      rotation: Math.PI / 2,
      props: { width: 1.6, base: 'legs', color: '#9a6b3f', finish: 'wood' },
    },
    {
      id: 'wfh-tv',
      defId: 'tv-wall',
      position: [8.45, 5.6],
      rotation: Math.PI / 2,
      props: {
        size: '55',
        mount: 'wall',
        mountHeight: 1.3,
        screen: 'on',
        screenContent: 'abstract',
      },
    },
    {
      id: 'wfh-cove',
      defId: 'cove-light',
      position: [8.41, 5.6],
      rotation: Math.PI / 2,
      props: { length: 1.6, mountHeight: 2.38 },
    },
    { id: 'wfh-fan', defId: 'ceiling-fan', position: [9.8, 5.6], rotation: 0, props: {} },
    { id: 'wfh-aircon', defId: 'aircon-unit', position: [11.5, 1.4], rotation: 0, props: {} },
    {
      id: 'wfh-curtain',
      defId: 'curtains',
      position: [10.82, 1.42],
      rotation: 0,
      props: { width: 2.8, height: 2.55, color: '#e6e0d2' },
    },
    // ── Study nook against the bedroom3-partition wall (north strip) ──
    {
      id: 'wfh-desk',
      defId: 'desk',
      position: [9.65, 2.4],
      rotation: Math.PI / 2,
      props: { width: 1.4, depth: 0.6, legStyle: 'hairpin', color: '#caa46a', finish: 'wood' },
    },
    {
      id: 'wfh-chair',
      defId: 'office-chair',
      position: [10.3, 2.4],
      rotation: -Math.PI / 2,
      props: { style: 'mesh', color: '#3a3f45' },
    },
    {
      id: 'wfh-monitor',
      defId: 'monitor',
      position: [9.5, 2.4],
      rotation: Math.PI / 2,
      props: { screen: 'on', screenContent: 'abstract' },
    },
    {
      id: 'wfh-shelf',
      defId: 'bookshelf',
      position: [9.5, 3.6],
      rotation: Math.PI / 2,
      props: { width: 0.9, height: 1.8, shelfCount: 5, color: '#caa46a', finish: 'wood' },
    },
    {
      id: 'wfh-plant',
      defId: 'potted-plant',
      position: [12.1, 5.2],
      rotation: 0,
      props: { type: 'palm', size: 'large', leafColor: '#4a7a44' },
    },
    // ── Round dining (south alcove) ──
    {
      id: 'wfh-dining',
      defId: 'dining-table-4',
      position: [11.5, 6.0],
      rotation: 0,
      props: { seats: '4', shape: 'round', topColor: '#9a6b3f', legColor: '#6b4f34' },
    },
    {
      id: 'wfh-dc-1',
      defId: 'dining-chair',
      position: [11.5, 5.25],
      rotation: 0,
      props: { style: 'wood', seatColor: '#9a6b3f' },
    },
    {
      id: 'wfh-dc-2',
      defId: 'dining-chair',
      position: [11.5, 6.75],
      rotation: Math.PI,
      props: { style: 'wood', seatColor: '#9a6b3f' },
    },
    {
      id: 'wfh-dc-3',
      defId: 'dining-chair',
      position: [10.55, 7.0],
      rotation: Math.PI,
      props: { style: 'wood', seatColor: '#9a6b3f' },
    },
    {
      id: 'wfh-pendant',
      defId: 'ceiling-light',
      position: [11.5, 6.0],
      rotation: 0,
      props: { style: 'pendant', shade: 'globe' },
    },
    {
      // Nudged west 0.03 m (v0.23.2.0): the east wall's SE structural
      // segment (`wall-ext-E-col2`, z=[6.5,8.235]) thickened to 300 mm —
      // its interior face moved 12.525→12.475, clipping this cabinet's old
      // flush back edge (12.5) by 0.025 m. New back edge 12.47, clear.
      id: 'wfh-shoe',
      defId: 'shoe-cabinet',
      position: [12.32, 7.55],
      rotation: -Math.PI / 2,
      props: { width: 0.9, depth: 0.3, style: 'open' },
    },
  ],
}
