import type { LayoutPreset } from './types'

/**
 * NEW (RM2, 2026-07-19): "Peranakan Accent" — cream walls + dark tropical wood
 * with jewel-toned emerald/coral/cobalt accents. Jewel tones stay in the
 * living/dining rooms; bedrooms read cream + wood only (`categoryStyle`).
 *
 * **Real encaustic tile in the living/dining (v0.31.8.17).** The G8 grounding
 * audit called this the one real fidelity gap in an otherwise-accurate theme:
 * geometric encaustic floor tiles are "among the most recognisable elements" of
 * Peranakan interiors, and this preset approximated them with a patterned RUG
 * over dark wood because no such material existed. One now does
 * (`floor-peranakan-*`, with the researched 200 mm module as of v0.31.8.16), so
 * the theme uses it.
 *
 * **Only in the living/dining, and that is researched rather than cautious.**
 * Encaustic tiles "line the five-foot ways and prestigious interior spaces" of a
 * Peranakan shophouse, whose plan "transitions from public to private" — the
 * front hall and courtyard, not the bedrooms. Tiling every dry floor would
 * repeat the mistake Coastal made by painting every wall its accent colour
 * (v0.31.8.2): taking an element the sources place in one zone and making it the
 * whole home. `dryFloor` therefore stays `floor-wood-ebony` and
 * `dryFloorByCategory` overrides only `living`.
 *
 * The patterned rug stays: it is a real Peranakan element in its own right, and
 * it now sits ON the tile rather than standing in for it.
 */
export const peranakanAccent: LayoutPreset = {
  id: 'peranakan-accent',
  group: 'theme',
  name: 'Peranakan Accent',
  description:
    'Encaustic tile in the hall, dark tropical wood elsewhere, emerald/coral/cobalt jewel accents.',
  dryFloor: 'floor-wood-ebony',
  // Encaustic tile in the public zone only — see the header. `living` covers the
  // living/dining on the default flat and on a custom plan alike.
  dryFloorByCategory: { living: 'floor-peranakan-jade' },
  wall: 'wall-paint-warm',
  paletteId: 'peranakan',
  style: {
    'sofa-3seat': {
      color: '#1f6f5c',
      material: 'fabric',
      pattern: 'plain',
      pillowColor: '#e2725b',
    },
    armchair: { color: '#1a3f8f', material: 'fabric', style: 'wingback' },
    'dining-chair': { style: 'wood', seatColor: '#e2725b', finish: 'wood' },
    rug: {
      color: '#f2e9d3',
      color2: '#1f6f5c',
      borderColor: '#1a3f8f',
      pattern: 'checkered',
    },
    'coffee-table': { color: '#4a352a', finish: 'wood', shape: 'round' },
    'side-table': { topColor: '#4a352a', finish: 'wood' },
    'dining-table-4': { topColor: '#4a352a', legColor: '#2f2318' },
    'bed-queen': {
      frameColor: '#4a352a',
      beddingColor: '#f2e9d3',
      headboardStyle: 'paneled',
      pillowColor: '#f2e9d3',
    },
    'bed-single': { frameColor: '#4a352a', beddingColor: '#f2e9d3' },
    'bed-double': { frameColor: '#4a352a', beddingColor: '#f2e9d3' },
    nightstand: { color: '#4a352a' },
    dresser: { color: '#4a352a' },
    bookshelf: { color: '#4a352a' },
    desk: { color: '#4a352a' },
    'tv-console': { color: '#4a352a' },
    'wardrobe-3door': { color: '#f2e9d3' },
    curtains: { color: '#f2e9d3' },
  },
  // Jewel accents stay in the living/dining rooms; bedrooms read cream + wood
  // only (RM2 categoryStyle > style).
  categoryStyle: {
    living: {
      armchair: { color: '#1a3f8f' },
      'sofa-3seat': { pillowColor: '#e2725b' },
    },
    dining: {
      'dining-chair': { seatColor: '#e2725b' },
    },
    bedroom: {
      'bed-queen': { pillowColor: '#f2e9d3' },
    },
    masterBedroom: {
      'bed-queen': { pillowColor: '#f2e9d3' },
    },
  },
}
