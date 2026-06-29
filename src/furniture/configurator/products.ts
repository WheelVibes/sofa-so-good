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

/** Registry of configurable products, in display order. */
export const CONFIGURABLE_PRODUCTS: readonly ConfigurableProduct[] = [MATTRESS_FRAME, MODULAR_SOFA]

/** Resolve a product by id (null when unknown). */
export function getConfigurableProduct(id: string): ConfigurableProduct | null {
  return CONFIGURABLE_PRODUCTS.find((p) => p.id === id) ?? null
}
