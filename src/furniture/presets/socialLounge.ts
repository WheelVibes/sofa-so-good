import type { LayoutPreset } from './types'

export const socialLounge: LayoutPreset = {
  id: 'social-lounge',
  group: 'layout',
  name: 'Social Lounge',
  description: 'Re-modelled L/D: a conversation grouping — sofa + two angled armchairs.',
  dryFloor: 'floor-wood-teak',
  wall: 'wall-paint-warm',
  style: {},
  // Room geometry (2026-07-23 default-flat revision): the conversation
  // grouping sits entirely in the north strip (x>=9.225), which still fits
  // unchanged (the room grew, not shrank, here). The TV/console/feature
  // cluster stays on the east wall — that wall now carries the L/D's main
  // window, but with the armchair already flush against the ONE windowless
  // wall available in this strip (x=9.225), there's no room left there for
  // the media wall too; left on the east wall as a `mounted` fixture (no
  // collision impact, a minor visual trade-off vs the fully re-walled
  // presets) rather than reworking this preset's whole conversation-grouping
  // concept.
  livingDining: [
    // ── Conversation grouping (north) — sofa flanked by two angled chairs ──
    {
      id: 'sl-sofa',
      defId: 'sofa-3seat',
      position: [10.6, 1.95],
      rotation: 0,
      props: {
        width: 2.1,
        depth: 0.9,
        color: '#9a6a52',
        material: 'fabric',
        pattern: 'plain',
        pillowColor: '#3f6b5e',
        accentPillows: 'four',
      },
    },
    {
      id: 'sl-arm-l',
      defId: 'armchair',
      position: [9.75, 3.65],
      rotation: Math.PI,
      props: { style: 'wingback', material: 'velvet', color: '#3f6b5e', sheen: 0.3 },
    },
    {
      id: 'sl-arm-r',
      defId: 'armchair',
      position: [11.55, 3.65],
      rotation: Math.PI,
      props: { style: 'tub', material: 'velvet', color: '#c9a24b', sheen: 0.3 },
    },
    {
      id: 'sl-rug',
      defId: 'rug',
      position: [10.6, 2.8],
      rotation: 0,
      props: {
        width: 2.3,
        depth: 1.8,
        color: '#cfc3a8',
        borderColor: '#5a4a32',
        pattern: 'plain',
      },
    },
    {
      id: 'sl-coffee',
      defId: 'coffee-table',
      position: [10.6, 2.9],
      rotation: 0,
      props: { shape: 'round', width: 0.8, depth: 0.8, color: '#5a3f2a', finish: 'wood' },
    },
    {
      id: 'sl-feature',
      defId: 'feature-wall',
      position: [12.53, 2.5],
      rotation: -Math.PI / 2,
      props: { width: 2.6, height: 2.55, style: 'slat', color: '#5a3f2a', finish: 'wood' },
    },
    {
      id: 'sl-console',
      defId: 'tv-console',
      position: [12.2, 2.5],
      rotation: -Math.PI / 2,
      props: { width: 1.6, base: 'plinth', color: '#5a3f2a', finish: 'wood' },
    },
    {
      id: 'sl-tv',
      defId: 'tv-wall',
      position: [12.42, 2.5],
      rotation: -Math.PI / 2,
      props: {
        size: '55',
        mount: 'wall',
        mountHeight: 1.3,
        screen: 'on',
        screenContent: 'sunset',
      },
    },
    {
      id: 'sl-cove',
      defId: 'cove-light',
      position: [12.5, 2.6],
      rotation: -Math.PI / 2,
      props: { length: 3.4, mountHeight: 2.38 },
    },
    {
      id: 'sl-lamp',
      defId: 'floor-lamp',
      position: [9.5, 3.0],
      rotation: 0,
      props: { base: 'arc', shade: 'drum', poleColor: '#1c1c1e' },
    },
    {
      id: 'sl-plant',
      defId: 'potted-plant',
      position: [12.2, 5.2],
      rotation: 0,
      props: { type: 'fiddle', size: 'large', potShape: 'cylinder', leafColor: '#3f7a3f' },
    },
    { id: 'sl-fan', defId: 'ceiling-fan', position: [10.6, 2.8], rotation: 0, props: {} },
    { id: 'sl-aircon', defId: 'aircon-unit', position: [10.6, 1.55], rotation: 0, props: {} },
    {
      id: 'sl-curtain',
      defId: 'curtains',
      position: [10.85, 1.42],
      rotation: 0,
      props: { width: 2.8, height: 2.55, color: '#cfc3a8' },
    },
    // ── Dining (south) — proven default positions ──
    {
      id: 'sl-dining',
      defId: 'dining-table-4',
      position: [10.55, 5.2],
      rotation: 0,
      props: { seats: '4', shape: 'rect', topColor: '#5a3f2a', legColor: '#3a2c1d' },
    },
    {
      id: 'sl-dc-n1',
      defId: 'dining-chair',
      position: [10.2, 4.45],
      rotation: 0,
      props: { style: 'wood', seatColor: '#9a6b3f' },
    },
    {
      id: 'sl-dc-n2',
      defId: 'dining-chair',
      position: [10.9, 4.45],
      rotation: 0,
      props: { style: 'wood', seatColor: '#9a6b3f' },
    },
    {
      id: 'sl-dc-s1',
      defId: 'dining-chair',
      position: [10.2, 5.95],
      rotation: Math.PI,
      props: { style: 'wood', seatColor: '#9a6b3f' },
    },
    {
      id: 'sl-dc-s2',
      defId: 'dining-chair',
      position: [10.9, 5.95],
      rotation: Math.PI,
      props: { style: 'wood', seatColor: '#9a6b3f' },
    },
    {
      id: 'sl-pendant',
      defId: 'ceiling-light',
      position: [10.55, 5.2],
      rotation: 0,
      props: { style: 'pendant', shade: 'cone' },
    },
    {
      // Nudged west 0.03 m (v0.23.2.0): the east wall's SE structural
      // segment (`wall-ext-E-col2`, z=[6.5,8.235]) thickened to 300 mm —
      // its interior face moved 12.525→12.475, clipping this cabinet's old
      // flush back edge (12.5) by 0.025 m. New back edge 12.47, clear.
      id: 'sl-shoe',
      defId: 'shoe-cabinet',
      position: [12.32, 7.45],
      rotation: -Math.PI / 2,
      props: { width: 0.9, depth: 0.3 },
    },
  ],
}
