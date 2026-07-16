/**
 * Authored configurable products (SLOT-201 / SLOT-202).
 *
 * Two all-procedural products (no GLB options → prod-safe, no network): a
 * mattress-on-frame bed and a modular sofa. Slot anchors + option footprints
 * follow the app convention (floor-anchored, footprint-centred, +Z forward).
 * Prices are explicit SGD, sourced to stay consistent with `furniturePrices.ts`
 * category bases. All geometry is boxes that connect (structural-soundness rule).
 */

import type { ConfigurableProduct, ConfiguredPart } from './model'

/** Box-part helper — keeps the product tables compact + readable. */
function box(
  role: string,
  position: [number, number, number],
  size: [number, number, number],
  material: string,
  color: string,
  finishKey: string,
): ConfiguredPart {
  return { role, position, size, material, color, finishKey }
}

const WOOD = '#9d7c54'
const FRAME_KEY = 'base:frame'
const SOFA_FABRIC = '#8a9a8f'

/** §6.1 Mattress-on-frame — all-procedural; the simplest end-to-end product. */
const MATTRESS_FRAME: ConfigurableProduct = {
  id: 'mattress-frame',
  label: 'Bed (mattress on frame)',
  category: 'beds',
  base: {
    footprint: { w: 1.6, d: 2.1, h: 0.3 },
    price: 220,
    parts: [
      box('frame', [-0.78, 0.15, 0], [0.04, 0.3, 2.1], 'wood', WOOD, FRAME_KEY), // left rail
      box('frame', [0.78, 0.15, 0], [0.04, 0.3, 2.1], 'wood', WOOD, FRAME_KEY), // right rail
      box('frame', [0, 0.15, 1.03], [1.6, 0.3, 0.04], 'wood', WOOD, FRAME_KEY), // foot rail
      box('frame', [0, 0.15, -1.03], [1.6, 0.3, 0.04], 'wood', WOOD, FRAME_KEY), // head rail
      box('frame', [0, 0.28, 0], [1.52, 0.04, 2.0], 'wood', WOOD, FRAME_KEY), // slat platform
    ],
  },
  slots: [
    {
      id: 'mattress',
      label: 'Mattress',
      anchor: { position: [0, 0.3, 0] }, // rests ON the frame's slat surface
      defaultOptionId: 'm-foam',
      options: [
        {
          id: 'm-foam',
          label: 'Foam 20 cm',
          price: 260,
          footprint: { w: 1.5, d: 2.0, h: 0.2 },
          parts: [
            box('cover', [0, 0.1, 0], [1.5, 0.2, 2.0], 'painted', '#e8e4dc', 'mattress:cover'),
          ],
        },
        {
          id: 'm-pocket',
          label: 'Pocket-spring 25 cm',
          price: 480,
          footprint: { w: 1.5, d: 2.0, h: 0.25 },
          parts: [
            box('cover', [0, 0.125, 0], [1.5, 0.25, 2.0], 'painted', '#eceae3', 'mattress:cover'),
          ],
        },
        {
          id: 'm-hybrid',
          label: 'Hybrid 30 cm',
          price: 640,
          footprint: { w: 1.5, d: 2.0, h: 0.3 },
          parts: [
            box('cover', [0, 0.15, 0], [1.5, 0.3, 2.0], 'painted', '#f0eee8', 'mattress:cover'),
          ],
        },
      ],
    },
    {
      id: 'headboard',
      label: 'Headboard',
      anchor: { position: [0, 0.3, -1.05] }, // back edge of the frame
      optional: true,
      defaultOptionId: 'hb-panel',
      options: [
        {
          id: 'hb-panel',
          label: 'Padded panel',
          price: 150,
          footprint: { w: 1.6, d: 0.08, h: 0.7 },
          parts: [
            box('face', [0, 0.35, 0], [1.6, 0.7, 0.08], 'painted', '#b8a890', 'headboard:face'),
          ],
        },
        {
          id: 'hb-slatted',
          label: 'Slatted timber',
          price: 120,
          footprint: { w: 1.6, d: 0.06, h: 0.6 },
          parts: [box('face', [0, 0.3, 0], [1.6, 0.6, 0.06], 'wood', WOOD, 'headboard:face')],
        },
      ],
    },
    {
      // SLOT-203 — the first GLB-sub-asset option: a bundled CC0 Poly Haven desk
      // lamp reparented beside the bed head as a bedside reading lamp. Its arm
      // (authored facing +Z) is quarter-turned to reach over the bed (+X). The
      // GLB is floor-centred/real-metre, so it seats on the floor at anchor.y=0.
      id: 'lamp',
      label: 'Bedside lamp',
      anchor: { position: [-0.95, 0, -0.72], rotationY: Math.PI / 2 },
      optional: true,
      defaultOptionId: 'lamp-arm',
      options: [
        {
          id: 'lamp-arm',
          label: 'Arm reading lamp',
          price: 85,
          footprint: { w: 0.202, d: 0.614, h: 0.893 },
          gltfUrl: '/assets/furniture/desk-lamp-arm.glb',
          license: 'CC0',
          attribution: 'Poly Haven',
          sourceUrl: 'https://polyhaven.com/a/desk_lamp_arm_01',
        },
      ],
    },
  ],
}

/** §6.2 Modular sofa — repeated/linear slots + mutex/excludes constraints. */
const MODULAR_SOFA: ConfigurableProduct = {
  id: 'modular-sofa',
  label: 'Modular sofa',
  category: 'seating',
  base: {
    footprint: { w: 2.1, d: 0.95, h: 0.85 },
    price: 520,
    parts: [
      box('upholstery', [0, 0.2, 0], [2.1, 0.4, 0.95], 'painted', SOFA_FABRIC, 'base:upholstery'),
      box(
        'upholstery',
        [0, 0.55, -0.4],
        [2.1, 0.5, 0.15],
        'painted',
        SOFA_FABRIC,
        'base:upholstery',
      ),
      box('upholstery', [0, 0.46, 0.05], [2.0, 0.12, 0.8], 'painted', '#9aa89e', 'base:upholstery'),
    ],
  },
  slots: [
    {
      id: 'leftEnd',
      label: 'Left end',
      anchor: { position: [-1.05, 0, 0] },
      optional: true,
      defaultOptionId: 'arm-std',
      options: [
        {
          id: 'arm-std',
          label: 'Armrest',
          price: 90,
          footprint: { w: 0.2, d: 0.95, h: 0.65 },
          parts: [
            box(
              'upholstery',
              [0, 0.325, 0],
              [0.2, 0.65, 0.95],
              'painted',
              SOFA_FABRIC,
              'leftEnd:upholstery',
            ),
          ],
        },
        {
          id: 'chaise-l',
          label: 'Left chaise',
          price: 380,
          footprint: { w: 0.95, d: 1.6, h: 0.45 },
          parts: [
            box(
              'upholstery',
              [0, 0.225, 0],
              [0.95, 0.45, 1.6],
              'painted',
              SOFA_FABRIC,
              'leftEnd:upholstery',
            ),
          ],
        },
      ],
    },
    {
      id: 'rightEnd',
      label: 'Right end',
      anchor: { position: [1.05, 0, 0], rotationY: Math.PI },
      optional: true,
      defaultOptionId: 'arm-std',
      options: [
        {
          id: 'arm-std',
          label: 'Armrest',
          price: 90,
          footprint: { w: 0.2, d: 0.95, h: 0.65 },
          parts: [
            box(
              'upholstery',
              [0, 0.325, 0],
              [0.2, 0.65, 0.95],
              'painted',
              SOFA_FABRIC,
              'rightEnd:upholstery',
            ),
          ],
        },
        {
          id: 'chaise-r',
          label: 'Right chaise',
          price: 380,
          footprint: { w: 0.95, d: 1.6, h: 0.45 },
          parts: [
            box(
              'upholstery',
              [0, 0.225, 0],
              [0.95, 0.45, 1.6],
              'painted',
              SOFA_FABRIC,
              'rightEnd:upholstery',
            ),
          ],
        },
      ],
    },
    {
      id: 'corner',
      label: 'Corner section',
      anchor: { position: [1.05, 0, -0.95] }, // extends back-right into an L
      optional: true,
      defaultOptionId: 'corner-1',
      options: [
        {
          id: 'corner-1',
          label: 'Corner section',
          price: 420,
          footprint: { w: 0.95, d: 0.95, h: 0.85 },
          parts: [
            box(
              'upholstery',
              [0, 0.2, 0],
              [0.95, 0.4, 0.95],
              'painted',
              SOFA_FABRIC,
              'corner:upholstery',
            ),
            box(
              'upholstery',
              [0, 0.55, -0.4],
              [0.95, 0.5, 0.15],
              'painted',
              SOFA_FABRIC,
              'corner:upholstery',
            ),
          ],
        },
      ],
    },
  ],
  constraints: [
    // A corner section replaces the right end (can't have both at the right edge).
    { kind: 'mutex', slots: ['rightEnd', 'corner'] },
    // No L on both ends (footprint would overflow an HDB living room).
    {
      kind: 'excludes',
      slot: 'leftEnd',
      option: 'chaise-l',
      conflictsWith: { slot: 'corner', option: 'corner-1' },
    },
  ],
}

/** §6.3 Modular cat tree (Pet program P2) — a sisal-post base + three tier
 *  slots, each fillable with a plush platform, a cosy house cube, a slung
 *  hammock, or (top tier) a raised perch. All-procedural (prod-safe). A hammock
 *  needs a solid tier below to hang over, so a `requires` constraint forces the
 *  tier below back to a platform. */
const SISAL = '#c9a875'
const PLUSH = '#c8bda8'
const CAT_TIER_H = [0.5, 0.95, 1.4] as const

/** Option: a plush landing platform. */
function platformOption(slotId: string): ConfiguredPart[] {
  return [box('platform', [0, 0, 0], [0.36, 0.045, 0.36], 'painted', PLUSH, `${slotId}:plush`)]
}

/** Option: a cosy house cube (platform floor + four walls + roof, front open). */
function houseOption(slotId: string): ConfiguredPart[] {
  const hw = 0.34
  const wall = 0.022
  const hh = 0.3
  const key = `${slotId}:house`
  return [
    box('floor', [0, 0, 0], [hw, 0.04, hw], 'painted', PLUSH, key),
    box('wall', [0, 0.02 + hh / 2, -hw / 2 + wall / 2], [hw, hh, wall], 'painted', PLUSH, key), // back
    box('wall', [-hw / 2 + wall / 2, 0.02 + hh / 2, 0], [wall, hh, hw], 'painted', PLUSH, key),
    box('wall', [hw / 2 - wall / 2, 0.02 + hh / 2, 0], [wall, hh, hw], 'painted', PLUSH, key),
    box('roof', [0, 0.02 + hh, 0], [hw, wall, hw], 'painted', PLUSH, key),
  ]
}

/** Option: a slung fabric hammock (a low bowed sling + two side rails). */
function hammockOption(slotId: string): ConfiguredPart[] {
  const key = `${slotId}:hammock`
  return [
    box('sling', [0, -0.12, 0], [0.34, 0.03, 0.3], 'painted', PLUSH, key),
    box('rail', [-0.18, -0.06, 0], [0.03, 0.16, 0.32], 'wood', SISAL, `${slotId}:rail`),
    box('rail', [0.18, -0.06, 0], [0.03, 0.16, 0.32], 'wood', SISAL, `${slotId}:rail`),
  ]
}

/** Option: a raised perch cup (platform + a low rim ring approximated by 4 sides). */
function perchOption(slotId: string): ConfiguredPart[] {
  const key = `${slotId}:perch`
  const w = 0.34
  const rim = 0.06
  const t = 0.02
  return [
    box('platform', [0, 0, 0], [w, 0.045, w], 'painted', PLUSH, key),
    box('rim', [0, rim / 2, -w / 2 + t / 2], [w, rim, t], 'painted', PLUSH, key),
    box('rim', [0, rim / 2, w / 2 - t / 2], [w, rim, t], 'painted', PLUSH, key),
    box('rim', [-w / 2 + t / 2, rim / 2, 0], [t, rim, w], 'painted', PLUSH, key),
    box('rim', [w / 2 - t / 2, rim / 2, 0], [t, rim, w], 'painted', PLUSH, key),
  ]
}

const CAT_TREE: ConfigurableProduct = {
  id: 'cat-tree-modular',
  label: 'Cat tree (modular)',
  category: 'pets',
  base: {
    footprint: { w: 0.5, d: 0.5, h: 1.5 },
    price: 120,
    parts: [
      box('base', [0, 0.025, 0], [0.5, 0.05, 0.5], 'painted', PLUSH, 'base:plinth'),
      // Central sisal trunk from the base up through every tier.
      box('post', [0, 0.775, 0], [0.09, 1.45, 0.09], 'wood', SISAL, 'base:post'),
    ],
  },
  slots: [
    {
      id: 'tier1',
      label: 'Lower tier',
      anchor: { position: [0.16, CAT_TIER_H[0], 0.12] },
      defaultOptionId: 'platform',
      options: [
        {
          id: 'platform',
          label: 'Platform',
          price: 25,
          footprint: { w: 0.36, d: 0.36, h: 0.05 },
          parts: platformOption('tier1'),
        },
        {
          id: 'house',
          label: 'House cube',
          price: 60,
          footprint: { w: 0.34, d: 0.34, h: 0.34 },
          parts: houseOption('tier1'),
        },
        {
          id: 'hammock',
          label: 'Hammock',
          price: 45,
          footprint: { w: 0.34, d: 0.32, h: 0.16 },
          parts: hammockOption('tier1'),
        },
      ],
    },
    {
      id: 'tier2',
      label: 'Middle tier',
      anchor: { position: [-0.16, CAT_TIER_H[1], -0.1] },
      defaultOptionId: 'house',
      options: [
        {
          id: 'platform',
          label: 'Platform',
          price: 25,
          footprint: { w: 0.36, d: 0.36, h: 0.05 },
          parts: platformOption('tier2'),
        },
        {
          id: 'house',
          label: 'House cube',
          price: 60,
          footprint: { w: 0.34, d: 0.34, h: 0.34 },
          parts: houseOption('tier2'),
        },
        {
          id: 'hammock',
          label: 'Hammock',
          price: 45,
          footprint: { w: 0.34, d: 0.32, h: 0.16 },
          parts: hammockOption('tier2'),
        },
      ],
    },
    {
      id: 'tier3',
      label: 'Top tier',
      anchor: { position: [0.12, CAT_TIER_H[2], 0.08] },
      defaultOptionId: 'perch',
      options: [
        {
          id: 'platform',
          label: 'Platform',
          price: 25,
          footprint: { w: 0.36, d: 0.36, h: 0.05 },
          parts: platformOption('tier3'),
        },
        {
          id: 'perch',
          label: 'Cup perch',
          price: 35,
          footprint: { w: 0.34, d: 0.34, h: 0.08 },
          parts: perchOption('tier3'),
        },
        {
          id: 'hammock',
          label: 'Hammock',
          price: 45,
          footprint: { w: 0.34, d: 0.32, h: 0.16 },
          parts: hammockOption('tier3'),
        },
      ],
    },
  ],
  constraints: [
    // A hammock hangs over the tier below, so that tier must be a solid platform.
    {
      kind: 'requires',
      ifSlot: 'tier2',
      ifOption: 'hammock',
      thenSlot: 'tier1',
      thenOption: 'platform',
    },
    {
      kind: 'requires',
      ifSlot: 'tier3',
      ifOption: 'hammock',
      thenSlot: 'tier2',
      thenOption: 'platform',
    },
  ],
}

/** Registry of configurable products, in display order. */
export const CONFIGURABLE_PRODUCTS: readonly ConfigurableProduct[] = [
  MATTRESS_FRAME,
  MODULAR_SOFA,
  CAT_TREE,
]

/** Resolve a product by id (null when unknown). */
export function getConfigurableProduct(id: string): ConfigurableProduct | null {
  return CONFIGURABLE_PRODUCTS.find((p) => p.id === id) ?? null
}
