import type { LayoutPreset } from './types'

/**
 * RM2 retune (2026-07-19): "Cozy Tropical" becomes "Tropical Biophilic" —
 * same teak/sage/terracotta palette, plus extra greenery via `extraItems`.
 *
 * **Sage moved from every wall to ONE feature wall (v0.31.8.2).**
 *
 * `docs/research/2026-09-02-scheme-theme-grounding.md` verified this palette and
 * flagged its emphasis: the sources say "one feature wall in terracotta or sage
 * green adds depth without overwhelming the space", while this preset applied
 * sage to every dry wall. SG-specific sources are more pointed still — these
 * shades "work best on a single feature wall, providing a focal point that
 * doesn't overwhelm the room's proportions", and a colour like terracotta
 * "should be used as a feature wall rather than on all four walls in smaller HDB
 * rooms".
 *
 * The foundation is now Warm cream (`#e9d8c4`): "warm white, off-white, warm
 * sand, and sage green all complement teak and walnut furniture", which is
 * exactly this theme's floor. Sage keeps the theme's identity on a single fluted
 * panel — vertical fluting being the most-specified SG feature-wall treatment,
 * and texture suiting a biophilic reading better than flat paint.
 *
 * Terracotta is unchanged: it was already an ACCENT here (sofa pillow, throws),
 * which is what the references call for. Only sage's SCOPE changed.
 */
export const cozyTropical: LayoutPreset = {
  id: 'cozy-tropical',
  group: 'theme',
  name: 'Tropical Biophilic',
  description:
    'Teak floors, warm-cream walls, one sage fluted feature wall, greenery + terracotta accents.',
  dryFloor: 'floor-wood-teak',
  wall: 'wall-paint-warm',
  paletteId: 'sage-cream',
  style: {
    'sofa-3seat': {
      color: '#3f6b5e',
      material: 'fabric',
      pattern: 'plain',
      pillowColor: '#c4683f',
    },
    armchair: { color: '#caa46a', material: 'fabric', style: 'wingback' },
    'dining-chair': { style: 'wood', seatColor: '#9a6b3f', finish: 'wood' },
    rug: { color: '#b4a890', borderColor: '#5a4a32', pattern: 'plain' },
    'coffee-table': { color: '#9a6b3f', finish: 'wood', shape: 'round' },
    'side-table': { topColor: '#9a6b3f', finish: 'wood' },
    'dining-table-4': { topColor: '#9a6b3f', legColor: '#6b4f34' },
    'bed-queen': {
      frameColor: '#9a6b3f',
      beddingColor: '#cfc3a8',
      throwColor: '#b5683f',
      headboardStyle: 'upholstered',
    },
    'bed-single': { frameColor: '#9a6b3f', beddingColor: '#cfc3a8', throwColor: '#b5683f' },
    'bed-double': { frameColor: '#9a6b3f', beddingColor: '#cfc3a8', throwColor: '#b5683f' },
    nightstand: { color: '#9a6b3f' },
    dresser: { color: '#9a6b3f' },
    bookshelf: { color: '#9a6b3f' },
    desk: { color: '#9a6b3f' },
    'tv-console': { color: '#9a6b3f' },
    'wardrobe-3door': { color: '#a6877c', doorStyle: 'hinged' },
    'potted-plant': { type: 'fiddle', size: 'large', leafColor: '#3f7a3f' },
    curtains: { color: '#cfd3b8' },
  },
  // Bedrooms keep the warm wood + terracotta throw but drop the living room's
  // saturated sofa green, reading calmer under the same theme (RM2).
  categoryStyle: {
    bedroom: {
      'bed-queen': { beddingColor: '#e2dcc8' },
    },
    masterBedroom: {
      'bed-queen': { beddingColor: '#e2dcc8' },
    },
  },
  // Biophilic touch: an extra potted plant in the main bedroom (living/dining
  // already has one at `default-ld-plant`).
  extraItems: [
    {
      id: 'cozy-plant-bedroom',
      defId: 'potted-plant',
      position: [2.9, 1.0],
      rotation: 0,
      props: { type: 'fiddle', size: 'medium', leafColor: '#3f7a3f' },
    },
    {
      id: 'cozy-feature',
      defId: 'feature-wall',
      // The living/dining wall Japandi and Modern Mono already use, against the
      // same default layout (none of these presets overrides `livingDining`),
      // so the position is proven rather than newly guessed.
      position: [12.53, 2.45],
      rotation: -Math.PI / 2,
      // Sage is `wall-paint-sage`'s own swatch — the colour that used to be on
      // every dry wall, now carried by this one panel.
      // Tinted timber rather than 'painted', for the reason measured on
      // `coastal-feature`: a painted FeatureWall carries no map, so its ~25 mm
      // flutes render as a flat slab in diffuse light. `wood` multiplies this
      // sage over the grain, which also suits a biophilic reading better than
      // flat paint — the theme is about natural materials.
      props: { width: 3.0, height: 2.55, style: 'fluted', color: '#a7b59a', finish: 'wood' },
    },
  ],
}
