import type { RoomId } from '../apartment/types'
import type { MaterialId } from '../materials/types'
import { BUILTIN_CATALOG } from './builtinCatalog'
import { defaultLayout } from './defaultLayout'
import type { LayoutEntry } from './defaults/types'
import type { ParamProps } from './types'
import { defaultParamProps } from './types'

/**
 * Full-flat layout presets. Rather than re-author every placement, a preset
 * reuses the curated default positions and restyles them: it overrides the
 * cosmetic props (colour / material / finish / weave / shape) per item type
 * and sets a coordinated floor + wall palette across the living spaces. This
 * keeps every preset collision-valid (identical positions to the move-in
 * default) while producing a distinct, cohesive interior-design look.
 */
export interface LayoutPreset {
  id: string
  name: string
  description: string
  /** Floor finish for the dry living spaces. */
  dryFloor: MaterialId
  /** Wall paint for the dry living spaces. */
  wall: MaterialId
  /** Per-defId cosmetic prop overrides merged onto the default items. */
  style: Record<string, ParamProps>
  /** Optional re-modelled living/dining arrangement (a researched real-world
   *  layout). When present these REPLACE the default `default-ld-*` items;
   *  other rooms keep their default placements (restyled by `style`).
   *  Sugar for `rooms.livingDining`. */
  livingDining?: LayoutEntry[]
  /** Optional re-modelled per-room arrangements. For each room id present, the
   *  authored entries REPLACE that room's default items (matched by id prefix);
   *  rooms not listed keep their default placements (restyled by `style`). */
  rooms?: Partial<Record<RoomId, LayoutEntry[]>>
  /** Extra items ADDED on top of the layout (e.g. feature walls). Taken as
   *  authored — typically noClip wall treatments so they always place. */
  extraItems?: LayoutEntry[]
}

/** Default-layout item-id prefix for each room (see src/furniture/defaults/).
 *  A `rooms` override for a room drops the defaults sharing its prefix. */
const ROOM_PREFIX: Partial<Record<RoomId, string>> = {
  mainBedroom: 'default-main',
  bedroom2: 'default-b2',
  bedroom3: 'default-b3',
  livingDining: 'default-ld',
  kitchen: 'default-k',
  bath1: 'default-bath1',
  bath2: 'default-bath2',
  serviceYard: 'default-sy',
}

/** Rooms a preset restyles (the "designed" living spaces; wet/utility rooms
 *  keep their hard-wearing finishes). Mirrors STYLE_ROOMS. */
export const PRESET_ROOMS: RoomId[] = [
  'mainBedroom',
  'bedroom2',
  'bedroom3',
  'livingDining',
  'corridor',
]

export const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    id: 'move-in',
    name: 'Move-in Default',
    description: 'The standard furnished 4-room — oak floors, white walls.',
    dryFloor: 'floor-wood-oak',
    wall: 'wall-paint-white',
    style: {},
  },
  {
    id: 'scandi-calm',
    name: 'Scandi Calm',
    description: 'Pale ash woods, soft-white walls, light textiles.',
    dryFloor: 'floor-wood-ash',
    wall: 'wall-paint-soft-white',
    style: {
      'sofa-3seat': {
        color: '#d6d4cc',
        material: 'fabric',
        pattern: 'plain',
        pillowColor: '#9bb0a6',
      },
      armchair: { color: '#cfcabb', material: 'fabric', style: 'standard' },
      'dining-chair': { style: 'wood', seatColor: '#cdb696', finish: 'wood' },
      rug: { color: '#e6e0d2', borderColor: '#cdbfa6', pattern: 'herringbone' },
      'coffee-table': { color: '#cdb696', finish: 'wood', shape: 'oval' },
      'side-table': { topColor: '#cdb696', finish: 'wood' },
      'dining-table-4': { topColor: '#cdb696', legColor: '#b39a72' },
      'bed-queen': {
        frameColor: '#cdb696',
        beddingColor: '#eceae2',
        headboardStyle: 'upholstered',
        pillowColor: '#ffffff',
      },
      'bed-single': {
        frameColor: '#cdb696',
        beddingColor: '#eceae2',
        headboardStyle: 'upholstered',
      },
      'bed-double': {
        frameColor: '#cdb696',
        beddingColor: '#eceae2',
        headboardStyle: 'upholstered',
      },
      nightstand: { color: '#cdb696' },
      dresser: { color: '#cdb696' },
      bookshelf: { color: '#cdb696' },
      desk: { color: '#cdb696' },
      'tv-console': { color: '#cdb696' },
      'wardrobe-3door': { color: '#e8e2d6' },
      curtains: { color: '#e6e0d2' },
    },
  },
  {
    id: 'warm-industrial',
    name: 'Warm Industrial',
    description: 'Charcoal tile, greige walls, leather and dark timber.',
    dryFloor: 'floor-tile-charcoal',
    wall: 'wall-paint-greige',
    style: {
      'sofa-3seat': { color: '#6b4a3a', material: 'leather', sheen: 0.4, pillowColor: '#3a352c' },
      armchair: { color: '#5a3f33', material: 'leather', style: 'tub', sheen: 0.4 },
      'dining-chair': { style: 'wood', seatColor: '#3a2c1d', finish: 'wood' },
      rug: { color: '#7a6f60', borderColor: '#3a352c', pattern: 'herringbone' },
      'coffee-table': { color: '#3a2c1d', finish: 'wood' },
      'side-table': { topColor: '#3a2c1d', shape: 'drum', finish: 'wood' },
      'dining-table-4': { topColor: '#4a3420', legColor: '#2c2118' },
      'bed-queen': { frameColor: '#3a2c1d', beddingColor: '#8a7f70', headboardStyle: 'paneled' },
      'bed-single': { frameColor: '#3a2c1d', beddingColor: '#8a7f70', headboardStyle: 'paneled' },
      'bed-double': { frameColor: '#3a2c1d', beddingColor: '#8a7f70', headboardStyle: 'paneled' },
      nightstand: { color: '#3a2c1d' },
      dresser: { color: '#3a2c1d', handle: 'bar' },
      bookshelf: { color: '#3a2c1d' },
      desk: { color: '#3a2c1d', legStyle: 'hairpin' },
      'tv-console': { color: '#3a2c1d', base: 'legs' },
      'wardrobe-3door': { color: '#4a4038', doorStyle: 'sliding' },
      curtains: { color: '#6a6258' },
    },
  },
  {
    id: 'cozy-tropical',
    name: 'Cozy Tropical',
    description: 'Teak floors, sage walls, greens and terracotta accents.',
    dryFloor: 'floor-wood-teak',
    wall: 'wall-paint-sage',
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
  },
  {
    id: 'japandi',
    name: 'Japandi',
    description: 'Oak + warm white, low-contrast natural calm with black accents.',
    dryFloor: 'floor-wood-oak',
    wall: 'wall-paint-warm',
    style: {
      'sofa-3seat': {
        color: '#b8ab97',
        material: 'fabric',
        pattern: 'plain',
        pillowColor: '#3a3a36',
      },
      armchair: { color: '#a89880', material: 'fabric', style: 'standard' },
      'dining-chair': { style: 'wood', seatColor: '#b8956a', finish: 'wood' },
      rug: { color: '#cfc6b4', borderColor: '#3a3a36', pattern: 'plain' },
      'coffee-table': { color: '#7a5f42', finish: 'wood', shape: 'round' },
      'side-table': { topColor: '#7a5f42', finish: 'wood' },
      'dining-table-4': { topColor: '#a8855a', legColor: '#3a3026' },
      'bed-queen': {
        frameColor: '#a8855a',
        beddingColor: '#e0d8c8',
        headboardStyle: 'paneled',
        pillowColor: '#cfc6b4',
      },
      'bed-single': { frameColor: '#a8855a', beddingColor: '#e0d8c8', headboardStyle: 'paneled' },
      'bed-double': { frameColor: '#a8855a', beddingColor: '#e0d8c8', headboardStyle: 'paneled' },
      nightstand: { color: '#a8855a' },
      dresser: { color: '#a8855a', handle: 'recessed' },
      bookshelf: { color: '#a8855a' },
      desk: { color: '#a8855a', legStyle: 'legs' },
      'tv-console': { color: '#3a3026', base: 'legs' },
      'wardrobe-3door': { color: '#cdbfa6', doorStyle: 'sliding' },
      curtains: { color: '#e0d8c8' },
    },
    extraItems: [
      {
        id: 'japandi-feature',
        defId: 'feature-wall',
        position: [12.53, 2.45],
        rotation: -Math.PI / 2,
        props: { width: 3.0, height: 2.55, style: 'fluted', color: '#a8855a', finish: 'wood' },
      },
      {
        id: 'japandi-bench',
        defId: 'bench',
        position: [1.05, 2.55],
        rotation: 0,
        props: { style: 'upholstered', material: 'fabric', color: '#cdb696', legColor: '#3a3026' },
      },
    ],
  },
  {
    id: 'coastal',
    name: 'Coastal',
    description: 'Pale ash, sky-blue walls, navy + white nautical textiles.',
    dryFloor: 'floor-wood-ash',
    wall: 'wall-paint-blue',
    style: {
      'sofa-3seat': {
        color: '#eceae2',
        material: 'fabric',
        pattern: 'striped',
        pillowColor: '#3b4a63',
      },
      armchair: { color: '#3b4a63', material: 'fabric', style: 'standard' },
      'dining-chair': { style: 'wood', seatColor: '#cdb696', finish: 'painted' },
      rug: { color: '#dfe2e6', borderColor: '#3b4a63', pattern: 'striped' },
      'coffee-table': { color: '#cdb696', finish: 'painted' },
      'side-table': { topColor: '#eceae2', finish: 'painted' },
      'dining-table-4': { topColor: '#cdb696', legColor: '#eceae2' },
      'bed-queen': {
        frameColor: '#cdb696',
        beddingColor: '#eef1f4',
        throwColor: '#3b4a63',
        headboardStyle: 'upholstered',
        beddingPattern: 'striped',
      },
      'bed-single': { frameColor: '#cdb696', beddingColor: '#eef1f4', throwColor: '#3b4a63' },
      'bed-double': { frameColor: '#cdb696', beddingColor: '#eef1f4', throwColor: '#3b4a63' },
      nightstand: { color: '#eceae2', finish: 'painted' },
      dresser: { color: '#eceae2', finish: 'painted' },
      bookshelf: { color: '#eceae2', finish: 'painted' },
      desk: { color: '#eceae2', finish: 'painted' },
      'tv-console': { color: '#eceae2', finish: 'painted' },
      'wardrobe-3door': { color: '#eef1f4' },
      curtains: { color: '#dfe2e6' },
    },
  },
  {
    id: 'open-lounge',
    name: 'Open-Concept Lounge',
    description: 'Re-modelled L/D: L-sectional facing a media wall, open dining.',
    dryFloor: 'floor-wood-oak',
    wall: 'wall-paint-greige',
    style: {},
    livingDining: [
      // ── Lounge zone (north), seating faces the east media wall ──
      {
        id: 'ol-sectional',
        defId: 'sofa-lshape',
        position: [9.95, 2.75],
        rotation: -Math.PI / 2,
        props: {
          width: 2.6,
          depth: 0.95,
          chaise: 1.0,
          chaiseSide: 'right',
          color: '#6f7a74',
          material: 'fabric',
          pattern: 'herringbone',
          pillowColor: '#c4683f',
        },
      },
      {
        id: 'ol-rug',
        defId: 'rug',
        position: [11.0, 2.75],
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
        position: [11.05, 2.75],
        rotation: 0,
        props: { shape: 'oval', width: 1.1, depth: 0.6, color: '#5a3f2a', finish: 'wood' },
      },
      {
        id: 'ol-feature',
        defId: 'feature-wall',
        position: [12.53, 2.75],
        rotation: -Math.PI / 2,
        props: { width: 2.8, height: 2.55, style: 'fluted', color: '#6f553f', finish: 'wood' },
      },
      {
        id: 'ol-media',
        defId: 'tv-console',
        position: [12.2, 2.75],
        rotation: -Math.PI / 2,
        props: { width: 2.0, base: 'legs', front: 'doors', color: '#4a3a2c', finish: 'wood' },
      },
      {
        id: 'ol-tv',
        defId: 'tv-wall',
        position: [12.42, 2.75],
        rotation: -Math.PI / 2,
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
        position: [12.5, 2.6],
        rotation: -Math.PI / 2,
        props: { length: 3.4, mountHeight: 2.38 },
      },
      {
        id: 'ol-plant',
        defId: 'potted-plant',
        position: [9.0, 4.5],
        rotation: 0,
        props: { type: 'fiddle', size: 'large', potShape: 'square', leafColor: '#3f7a3f' },
      },
      {
        id: 'ol-lamp',
        defId: 'floor-lamp',
        position: [11.5, 1.85],
        rotation: 0,
        props: { base: 'tripod', shade: 'drum' },
      },
      { id: 'ol-fan', defId: 'ceiling-fan', position: [10.7, 2.75], rotation: 0, props: {} },
      { id: 'ol-aircon', defId: 'aircon-unit', position: [10.6, 1.55], rotation: 0, props: {} },
      {
        id: 'ol-curtain',
        defId: 'curtains',
        position: [10.85, 1.5],
        rotation: 0,
        props: { width: 2.8, height: 2.3, color: '#cfc6b4' },
      },
      // ── Dining zone (south), open to the lounge ──
      {
        id: 'ol-dining',
        defId: 'dining-table-4',
        position: [10.7, 5.75],
        rotation: 0,
        props: { seats: '6', shape: 'oval', topColor: '#5a3f2a', legColor: '#3a2c1d' },
      },
      {
        id: 'ol-dc-n1',
        defId: 'dining-chair',
        position: [9.95, 5.05],
        rotation: 0,
        props: { style: 'upholstered', seatColor: '#8a7f70' },
      },
      {
        id: 'ol-dc-n2',
        defId: 'dining-chair',
        position: [10.7, 5.05],
        rotation: 0,
        props: { style: 'upholstered', seatColor: '#8a7f70' },
      },
      {
        id: 'ol-dc-n3',
        defId: 'dining-chair',
        position: [11.45, 5.05],
        rotation: 0,
        props: { style: 'upholstered', seatColor: '#8a7f70' },
      },
      {
        id: 'ol-dc-s1',
        defId: 'dining-chair',
        position: [9.95, 6.45],
        rotation: Math.PI,
        props: { style: 'upholstered', seatColor: '#8a7f70' },
      },
      {
        id: 'ol-dc-s2',
        defId: 'dining-chair',
        position: [10.7, 6.45],
        rotation: Math.PI,
        props: { style: 'upholstered', seatColor: '#8a7f70' },
      },
      {
        id: 'ol-dc-s3',
        defId: 'dining-chair',
        position: [11.45, 6.45],
        rotation: Math.PI,
        props: { style: 'upholstered', seatColor: '#8a7f70' },
      },
      {
        id: 'ol-pendant',
        defId: 'ceiling-light',
        position: [10.7, 5.75],
        rotation: 0,
        props: { style: 'pendant', shade: 'drum' },
      },
      // ── Entry alcove (SE): shoe storage only — kept clear for the door. ──
      {
        id: 'ol-shoe',
        defId: 'shoe-cabinet',
        position: [12.35, 7.45],
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
  },
  {
    id: 'entertainer',
    name: "Entertainer's Lounge",
    description: 'Re-modelled L/D: L-sofa to a media credenza + bar cart, six-seat dining.',
    dryFloor: 'floor-wood-walnut',
    wall: 'wall-paint-greige',
    style: {},
    livingDining: [
      // ── Lounge zone (north): sectional faces the east media wall ──
      {
        id: 'es-sectional',
        defId: 'sofa-lshape',
        position: [9.95, 2.75],
        rotation: -Math.PI / 2,
        props: {
          width: 2.6,
          depth: 0.95,
          chaise: 1.0,
          chaiseSide: 'right',
          color: '#4a5a63',
          material: 'fabric',
          pattern: 'plain',
          pillowColor: '#c9a24b',
        },
      },
      {
        id: 'es-rug',
        defId: 'rug',
        position: [11.0, 2.75],
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
        position: [11.05, 2.75],
        rotation: 0,
        props: { shape: 'oval', width: 1.1, depth: 0.6, color: '#3f2f22', finish: 'wood' },
      },
      {
        id: 'es-feature',
        defId: 'feature-wall',
        position: [12.53, 2.75],
        rotation: -Math.PI / 2,
        props: { width: 2.8, height: 2.55, style: 'slat', color: '#4a3a2c', finish: 'wood' },
      },
      // Media credenza — a long sideboard under the wall-mounted TV.
      {
        id: 'es-credenza',
        defId: 'sideboard',
        position: [12.32, 2.75],
        rotation: -Math.PI / 2,
        props: {
          width: 2.0,
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
        position: [12.45, 2.75],
        rotation: -Math.PI / 2,
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
        position: [12.5, 2.6],
        rotation: -Math.PI / 2,
        props: { length: 3.4, mountHeight: 2.38 },
      },
      // Bar cart tucked against the east wall between lounge and dining.
      {
        id: 'es-barcart',
        defId: 'bar-cart',
        position: [12.05, 4.55],
        rotation: 0,
        props: { tiers: 3, frame: 'brass', shelf: 'glass' },
      },
      {
        id: 'es-plant',
        defId: 'potted-plant',
        position: [9.0, 4.5],
        rotation: 0,
        props: { type: 'fiddle', size: 'large', potShape: 'cylinder', leafColor: '#3f7a3f' },
      },
      {
        id: 'es-lamp',
        defId: 'floor-lamp',
        position: [11.5, 1.85],
        rotation: 0,
        props: { base: 'tripod', shade: 'drum' },
      },
      { id: 'es-fan', defId: 'ceiling-fan', position: [10.7, 2.75], rotation: 0, props: {} },
      { id: 'es-aircon', defId: 'aircon-unit', position: [10.6, 1.55], rotation: 0, props: {} },
      {
        id: 'es-curtain',
        defId: 'curtains',
        position: [10.85, 1.5],
        rotation: 0,
        props: { width: 2.8, height: 2.3, color: '#cfc6b4' },
      },
      // ── Dining zone (south), open to the lounge ──
      {
        id: 'es-dining',
        defId: 'dining-table-4',
        position: [10.7, 5.75],
        rotation: 0,
        props: { seats: '6', shape: 'oval', topColor: '#3f2f22', legColor: '#2c2118' },
      },
      {
        id: 'es-dc-n1',
        defId: 'dining-chair',
        position: [9.95, 5.05],
        rotation: 0,
        props: { style: 'upholstered', seatColor: '#4a5a63' },
      },
      {
        id: 'es-dc-n2',
        defId: 'dining-chair',
        position: [10.7, 5.05],
        rotation: 0,
        props: { style: 'upholstered', seatColor: '#4a5a63' },
      },
      {
        id: 'es-dc-n3',
        defId: 'dining-chair',
        position: [11.45, 5.05],
        rotation: 0,
        props: { style: 'upholstered', seatColor: '#4a5a63' },
      },
      {
        id: 'es-dc-s1',
        defId: 'dining-chair',
        position: [9.95, 6.45],
        rotation: Math.PI,
        props: { style: 'upholstered', seatColor: '#4a5a63' },
      },
      {
        id: 'es-dc-s2',
        defId: 'dining-chair',
        position: [10.7, 6.45],
        rotation: Math.PI,
        props: { style: 'upholstered', seatColor: '#4a5a63' },
      },
      {
        id: 'es-dc-s3',
        defId: 'dining-chair',
        position: [11.45, 6.45],
        rotation: Math.PI,
        props: { style: 'upholstered', seatColor: '#4a5a63' },
      },
      {
        id: 'es-pendant',
        defId: 'ceiling-light',
        position: [10.7, 5.75],
        rotation: 0,
        props: { style: 'pendant', shade: 'drum' },
      },
      {
        id: 'es-shoe',
        defId: 'shoe-cabinet',
        position: [12.35, 7.45],
        rotation: -Math.PI / 2,
        props: { width: 0.9, depth: 0.3 },
      },
    ],
  },
  {
    id: 'broken-plan',
    name: 'Broken-Plan Living',
    description:
      'Re-modelled L/D: a slat screen zones the lounge from the dining without closing it.',
    dryFloor: 'floor-wood-oak',
    wall: 'wall-paint-warm',
    style: {},
    livingDining: [
      // ── Lounge (north), facing the east media wall ──
      {
        id: 'bp-sofa',
        defId: 'sofa-3seat',
        position: [9.6, 2.55],
        rotation: Math.PI / 2,
        props: { color: '#7d8a82', material: 'fabric', pattern: 'plain', pillowColor: '#b5683f' },
      },
      {
        id: 'bp-console',
        defId: 'tv-console',
        position: [12.1, 2.45],
        rotation: -Math.PI / 2,
        props: { width: 1.6, base: 'legs', color: '#5a3f2a', finish: 'wood' },
      },
      {
        id: 'bp-tv',
        defId: 'tv-wall',
        position: [12.45, 2.45],
        rotation: -Math.PI / 2,
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
        position: [12.42, 2.45],
        rotation: -Math.PI / 2,
        props: { width: 1.2, mountHeight: 0.78, grille: 'fabric', color: '#1c1c1e' },
      },
      {
        id: 'bp-cove',
        defId: 'cove-light',
        position: [12.5, 2.6],
        rotation: -Math.PI / 2,
        props: { length: 3.4, mountHeight: 2.38 },
      },
      {
        id: 'bp-rug',
        defId: 'rug',
        position: [10.95, 2.55],
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
        position: [10.95, 2.55],
        rotation: Math.PI / 2,
        props: { shape: 'oval', width: 1.0, depth: 0.55, color: '#5a3f2a', finish: 'wood' },
      },
      {
        id: 'bp-ottoman',
        defId: 'ottoman',
        position: [11.0, 3.4],
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
      { id: 'bp-fan', defId: 'ceiling-fan', position: [10.95, 2.55], rotation: 0, props: {} },
      { id: 'bp-aircon', defId: 'aircon-unit', position: [10.6, 1.55], rotation: 0, props: {} },
      {
        id: 'bp-curtain',
        defId: 'curtains',
        position: [10.85, 1.5],
        rotation: 0,
        props: { width: 2.8, height: 2.3, color: '#e6ddca' },
      },
      // ── The zoning screen between lounge and dining (partial width → walkway east) ──
      {
        id: 'bp-divider',
        defId: 'room-divider',
        position: [9.95, 3.95],
        rotation: 0,
        props: { width: 1.5, height: 1.8, style: 'slat', color: '#5a3f2a', finish: 'wood' },
      },
      // ── Dining (south) ──
      {
        id: 'bp-dining',
        defId: 'dining-table-4',
        position: [10.7, 5.75],
        rotation: 0,
        props: { seats: '6', shape: 'oval', topColor: '#5a3f2a', legColor: '#3a2c1d' },
      },
      {
        id: 'bp-dc-n1',
        defId: 'dining-chair',
        position: [9.95, 5.05],
        rotation: 0,
        props: { style: 'wood', seatColor: '#9a6b3f' },
      },
      {
        id: 'bp-dc-n2',
        defId: 'dining-chair',
        position: [10.7, 5.05],
        rotation: 0,
        props: { style: 'wood', seatColor: '#9a6b3f' },
      },
      {
        id: 'bp-dc-n3',
        defId: 'dining-chair',
        position: [11.45, 5.05],
        rotation: 0,
        props: { style: 'wood', seatColor: '#9a6b3f' },
      },
      {
        id: 'bp-dc-s1',
        defId: 'dining-chair',
        position: [9.95, 6.45],
        rotation: Math.PI,
        props: { style: 'wood', seatColor: '#9a6b3f' },
      },
      {
        id: 'bp-dc-s2',
        defId: 'dining-chair',
        position: [10.7, 6.45],
        rotation: Math.PI,
        props: { style: 'wood', seatColor: '#9a6b3f' },
      },
      {
        id: 'bp-dc-s3',
        defId: 'dining-chair',
        position: [11.45, 6.45],
        rotation: Math.PI,
        props: { style: 'wood', seatColor: '#9a6b3f' },
      },
      {
        id: 'bp-pendant',
        defId: 'ceiling-light',
        position: [10.7, 5.75],
        rotation: 0,
        props: { style: 'pendant', shade: 'drum' },
      },
      {
        id: 'bp-shoe',
        defId: 'shoe-cabinet',
        position: [12.35, 7.45],
        rotation: -Math.PI / 2,
        props: { width: 0.9, depth: 0.3 },
      },
    ],
  },
  {
    id: 'wfh-studio',
    name: 'Work-From-Home',
    description: 'Re-modelled L/D: compact lounge, a study nook + shelving, round dining.',
    dryFloor: 'floor-wood-ash',
    wall: 'wall-paint-soft-white',
    style: {},
    livingDining: [
      // ── Compact lounge (north) facing the east media wall ──
      {
        id: 'wfh-sofa',
        defId: 'sofa-2seat',
        position: [9.65, 2.5],
        rotation: Math.PI / 2,
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
        position: [11.0, 2.5],
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
        position: [11.0, 2.5],
        rotation: 0,
        props: { shape: 'round', width: 0.9, depth: 0.9, color: '#9a6b3f', finish: 'wood' },
      },
      {
        id: 'wfh-media',
        defId: 'tv-console',
        position: [12.2, 2.5],
        rotation: -Math.PI / 2,
        props: { width: 1.6, base: 'legs', color: '#9a6b3f', finish: 'wood' },
      },
      {
        id: 'wfh-tv',
        defId: 'tv-wall',
        position: [12.48, 2.5],
        rotation: -Math.PI / 2,
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
        position: [12.5, 2.6],
        rotation: -Math.PI / 2,
        props: { length: 3.4, mountHeight: 2.38 },
      },
      { id: 'wfh-fan', defId: 'ceiling-fan', position: [10.6, 2.8], rotation: 0, props: {} },
      { id: 'wfh-aircon', defId: 'aircon-unit', position: [10.6, 1.55], rotation: 0, props: {} },
      {
        id: 'wfh-curtain',
        defId: 'curtains',
        position: [10.85, 1.5],
        rotation: 0,
        props: { width: 2.8, height: 2.3, color: '#e6e0d2' },
      },
      // ── Study nook against the west wall ──
      {
        id: 'wfh-desk',
        defId: 'desk',
        position: [9.5, 4.4],
        rotation: Math.PI / 2,
        props: { width: 1.4, depth: 0.6, legStyle: 'hairpin', color: '#caa46a', finish: 'wood' },
      },
      {
        id: 'wfh-chair',
        defId: 'office-chair',
        position: [10.3, 4.4],
        rotation: -Math.PI / 2,
        props: { style: 'mesh', color: '#3a3f45' },
      },
      {
        id: 'wfh-monitor',
        defId: 'monitor',
        position: [9.35, 4.4],
        rotation: Math.PI / 2,
        props: { screen: 'on', screenContent: 'abstract' },
      },
      {
        id: 'wfh-shelf',
        defId: 'bookshelf',
        position: [9.35, 5.7],
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
        position: [10.95, 6.0],
        rotation: 0,
        props: { seats: '4', shape: 'round', topColor: '#9a6b3f', legColor: '#6b4f34' },
      },
      {
        id: 'wfh-dc-1',
        defId: 'dining-chair',
        position: [10.95, 5.25],
        rotation: 0,
        props: { style: 'wood', seatColor: '#9a6b3f' },
      },
      {
        id: 'wfh-dc-2',
        defId: 'dining-chair',
        position: [10.95, 6.75],
        rotation: Math.PI,
        props: { style: 'wood', seatColor: '#9a6b3f' },
      },
      {
        id: 'wfh-dc-3',
        defId: 'dining-chair',
        position: [12.0, 6.0],
        rotation: -Math.PI / 2,
        props: { style: 'wood', seatColor: '#9a6b3f' },
      },
      {
        id: 'wfh-pendant',
        defId: 'ceiling-light',
        position: [10.95, 6.0],
        rotation: 0,
        props: { style: 'pendant', shade: 'globe' },
      },
      {
        id: 'wfh-shoe',
        defId: 'shoe-cabinet',
        position: [12.35, 7.45],
        rotation: -Math.PI / 2,
        props: { width: 0.9, depth: 0.3, style: 'open' },
      },
    ],
  },
  {
    id: 'social-lounge',
    name: 'Social Lounge',
    description: 'Re-modelled L/D: a conversation grouping — sofa + two angled armchairs.',
    dryFloor: 'floor-wood-teak',
    wall: 'wall-paint-warm',
    style: {},
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
        position: [9.65, 3.65],
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
        position: [9.4, 3.0],
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
        position: [10.85, 1.5],
        rotation: 0,
        props: { width: 2.8, height: 2.3, color: '#cfc3a8' },
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
        id: 'sl-shoe',
        defId: 'shoe-cabinet',
        position: [12.35, 7.45],
        rotation: -Math.PI / 2,
        props: { width: 0.9, depth: 0.3 },
      },
    ],
  },
  {
    id: 'minimalist',
    name: 'Minimalist',
    description: 'Re-modelled L/D: pared-back, low furniture, lots of open floor.',
    dryFloor: 'floor-wood-ash',
    wall: 'wall-paint-soft-white',
    style: {},
    // Subset of the proven default positions (omits clutter) → always valid.
    livingDining: [
      {
        id: 'mn-sofa',
        defId: 'sofa-3seat',
        position: [9.6, 2.55],
        rotation: Math.PI / 2,
        props: { armStyle: 'low', color: '#dad7cf', material: 'fabric', accentPillows: 'none' },
      },
      {
        id: 'mn-console',
        defId: 'tv-console',
        position: [12.1, 2.45],
        rotation: -Math.PI / 2,
        props: { width: 1.6, base: 'plinth', color: '#cdb696', finish: 'wood' },
      },
      {
        id: 'mn-tv',
        defId: 'tv-wall',
        position: [12.45, 2.45],
        rotation: -Math.PI / 2,
        props: { size: '55', mount: 'wall', mountHeight: 1.3, screen: 'off' },
      },
      {
        id: 'mn-cove',
        defId: 'cove-light',
        position: [12.5, 2.6],
        rotation: -Math.PI / 2,
        props: { length: 3.4, mountHeight: 2.38 },
      },
      {
        id: 'mn-rug',
        defId: 'rug',
        position: [10.95, 2.55],
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
        position: [10.95, 2.55],
        rotation: Math.PI / 2,
        props: { shape: 'oval', width: 1.0, depth: 0.55, color: '#cdb696', finish: 'wood' },
      },
      { id: 'mn-fan', defId: 'ceiling-fan', position: [10.95, 2.55], rotation: 0, props: {} },
      { id: 'mn-aircon', defId: 'aircon-unit', position: [10.6, 1.55], rotation: 0, props: {} },
      {
        id: 'mn-curtain',
        defId: 'curtains',
        position: [10.85, 1.5],
        rotation: 0,
        props: { width: 2.8, height: 2.3, color: '#e6e0d2' },
      },
      {
        id: 'mn-dining',
        defId: 'dining-table-4',
        position: [10.55, 5.2],
        rotation: 0,
        props: { seats: '4', shape: 'round', topColor: '#cdb696', legColor: '#b39a72' },
      },
      {
        id: 'mn-dc-1',
        defId: 'dining-chair',
        position: [10.2, 4.45],
        rotation: 0,
        props: { style: 'wood', seatColor: '#cdb696' },
      },
      {
        id: 'mn-dc-2',
        defId: 'dining-chair',
        position: [10.9, 4.45],
        rotation: 0,
        props: { style: 'wood', seatColor: '#cdb696' },
      },
      {
        id: 'mn-dc-3',
        defId: 'dining-chair',
        position: [10.2, 5.95],
        rotation: Math.PI,
        props: { style: 'wood', seatColor: '#cdb696' },
      },
      {
        id: 'mn-dc-4',
        defId: 'dining-chair',
        position: [10.9, 5.95],
        rotation: Math.PI,
        props: { style: 'wood', seatColor: '#cdb696' },
      },
      {
        id: 'mn-pendant',
        defId: 'ceiling-light',
        position: [10.55, 5.2],
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
        id: 'mn-shoe',
        defId: 'shoe-cabinet',
        position: [12.35, 7.45],
        rotation: -Math.PI / 2,
        props: { width: 0.9, depth: 0.3 },
      },
    ],
  },
  {
    id: 'boutique-suite',
    name: 'Boutique Suite',
    description: 'Hotel-style main bedroom: symmetric bed, twin nightstands, foot bench.',
    dryFloor: 'floor-wood-walnut',
    wall: 'wall-paint-greige',
    style: {
      'sofa-3seat': {
        color: '#8f857a',
        material: 'fabric',
        pattern: 'plain',
        pillowColor: '#3a352c',
      },
      armchair: { color: '#7d7468', material: 'velvet', sheen: 0.3, style: 'tub' },
      rug: { color: '#cfc6b8', borderColor: '#5a4a32', pattern: 'plain' },
      curtains: { color: '#d8cdb8' },
    },
    rooms: {
      // Main bedroom → balanced hotel layout. Queen centred on the north wall
      // (headboard wall) with twin nightstands + lamps; wardrobe on the solid
      // east wall; a bench at the foot. Symmetry reads as a boutique suite.
      mainBedroom: [
        {
          id: 'default-main-bed',
          defId: 'bed-queen',
          position: [1.5, 1.25],
          rotation: 0,
          props: {
            frameColor: '#4a3a2c',
            beddingColor: '#e8e2d6',
            headboardStyle: 'upholstered',
            headboardColor: '#8f857a',
            throwColor: '#6b5f4e',
            pillowColor: '#ffffff',
          },
        },
        {
          id: 'default-main-ns-l',
          defId: 'nightstand',
          position: [0.475, 0.55],
          rotation: 0,
          props: { color: '#4a3a2c' },
        },
        {
          id: 'default-main-ns-r',
          defId: 'nightstand',
          position: [2.525, 0.55],
          rotation: 0,
          props: { color: '#4a3a2c' },
        },
        {
          id: 'default-main-lamp-l',
          defId: 'table-lamp',
          position: [0.475, 0.55],
          rotation: 0,
          props: { surfaceHeight: 0.52, shade: 'drum' },
        },
        {
          id: 'default-main-lamp-r',
          defId: 'table-lamp',
          position: [2.525, 0.55],
          rotation: 0,
          props: { surfaceHeight: 0.52, shade: 'drum' },
        },
        {
          id: 'default-main-wardrobe',
          defId: 'wardrobe-3door',
          position: [2.7, 1.95],
          rotation: -Math.PI / 2,
          props: { width: 1.4, doorStyle: 'sliding', color: '#6b5f4e' },
        },
        {
          id: 'default-main-bench',
          defId: 'bench',
          position: [1.5, 2.55],
          rotation: 0,
          props: {
            style: 'upholstered',
            material: 'velvet',
            color: '#7d7468',
            legColor: '#3a2c1d',
            sheen: 0.3,
          },
        },
        {
          id: 'default-main-rug',
          defId: 'rug',
          position: [1.4, 2.0],
          rotation: 0,
          props: { width: 1.8, depth: 1.2, color: '#cfc6b8', borderColor: '#5a4a32' },
        },
        {
          id: 'default-main-pendant',
          defId: 'ceiling-light',
          position: [1.5, 1.6],
          rotation: 0,
          props: { style: 'flush' },
        },
        {
          id: 'default-main-curtain',
          defId: 'curtains',
          position: [0.28, 2.2],
          rotation: Math.PI / 2,
          props: { width: 2.3, height: 2.3, color: '#d8cdb8' },
        },
        {
          id: 'default-main-sconce-l',
          defId: 'wall-sconce',
          position: [0.45, 0.3],
          rotation: 0,
          props: { mountHeight: 1.45 },
        },
        {
          id: 'default-main-sconce-r',
          defId: 'wall-sconce',
          position: [2.55, 0.3],
          rotation: 0,
          props: { mountHeight: 1.45 },
        },
      ],
    },
  },
  {
    id: 'family-nursery',
    name: 'Family Nursery',
    description:
      'Soft warm flat; Bedroom 3 re-modelled as a nursery (crib + changing + nursing nook).',
    dryFloor: 'floor-wood-ash',
    wall: 'wall-paint-warm',
    style: {
      'sofa-3seat': {
        color: '#cfc3b2',
        material: 'fabric',
        pattern: 'plain',
        pillowColor: '#b48a6a',
      },
      armchair: { color: '#cbb79f', material: 'fabric', style: 'standard' },
      rug: { color: '#e6ddca', borderColor: '#c8b89c', pattern: 'plain' },
      'bed-queen': {
        frameColor: '#cdb696',
        beddingColor: '#efe9dc',
        headboardStyle: 'upholstered',
      },
      'wardrobe-3door': { color: '#e6ddca', doorStyle: 'sliding' },
      curtains: { color: '#e6ddca' },
    },
    rooms: {
      // Bedroom 3 → nursery. East wall (solid) holds the crib; the west wall
      // (solid partition) a changing dresser; a nursing chair + arc lamp nook
      // to the south; soft rug centred.
      bedroom3: [
        {
          id: 'default-b3-crib',
          defId: 'crib',
          position: [8.5, 1.4],
          rotation: -Math.PI / 2,
          props: {
            endStyle: 'slat',
            color: '#efe9dc',
            finish: 'painted',
            mattressColor: '#d6e2dc',
            mattressLevel: 'high',
          },
        },
        {
          id: 'default-b3-changer',
          defId: 'dresser',
          position: [6.45, 1.0],
          rotation: Math.PI / 2,
          props: { width: 1.2, rows: 3, color: '#cdb696', handle: 'knob' },
        },
        {
          id: 'default-b3-glider',
          defId: 'armchair',
          position: [7.5, 3.0],
          rotation: Math.PI,
          props: { style: 'standard', material: 'fabric', color: '#b48a6a' },
        },
        {
          id: 'default-b3-lamp',
          defId: 'floor-lamp',
          position: [6.4, 3.1],
          rotation: 0.6,
          props: { base: 'arc', shade: 'drum', poleColor: '#3a3026' },
        },
        {
          id: 'default-b3-rug',
          defId: 'rug',
          position: [7.4, 2.4],
          rotation: 0,
          props: {
            width: 1.6,
            depth: 1.2,
            color: '#e6ddca',
            borderColor: '#c8b89c',
            pattern: 'plain',
          },
        },
        {
          id: 'default-b3-pendant',
          defId: 'ceiling-light',
          position: [7.5, 1.9],
          rotation: 0,
          props: { style: 'flush' },
        },
        {
          id: 'default-b3-plant',
          defId: 'potted-plant',
          position: [8.55, 3.0],
          rotation: 0,
          props: { size: 'small', type: 'snake' },
        },
        {
          id: 'default-b3-art',
          defId: 'wall-art',
          position: [6.14, 2.4],
          rotation: Math.PI / 2,
          props: { width: 0.7, height: 0.5, artColor: '#b48a6a' },
        },
      ],
    },
  },
  {
    id: 'modern-mono',
    name: 'Modern Mono',
    description: 'Grey porcelain, charcoal walls, glossy monochrome.',
    dryFloor: 'floor-tile-grey',
    wall: 'wall-paint-charcoal',
    style: {
      'sofa-3seat': {
        color: '#2c2e30',
        material: 'fabric',
        pattern: 'plain',
        pillowColor: '#9aa0a6',
      },
      armchair: { color: '#3a3d42', material: 'velvet', sheen: 0.4, style: 'tub' },
      'dining-chair': { style: 'upholstered', seatColor: '#2c2e30' },
      rug: { color: '#5a5e63', borderColor: '#2b2b2b', pattern: 'plain' },
      'coffee-table': { color: '#1c1f24', finish: 'gloss' },
      'side-table': { topColor: '#1c1f24', finish: 'gloss', shape: 'drum' },
      'dining-table-4': { topColor: '#2b2e33', legColor: '#1c1f24', finish: 'gloss' },
      'bed-queen': {
        frameColor: '#2b2e33',
        beddingColor: '#9aa0a6',
        headboardStyle: 'upholstered',
      },
      'bed-single': {
        frameColor: '#2b2e33',
        beddingColor: '#9aa0a6',
        headboardStyle: 'upholstered',
      },
      'bed-double': {
        frameColor: '#2b2e33',
        beddingColor: '#9aa0a6',
        headboardStyle: 'upholstered',
      },
      nightstand: { color: '#2b2e33', finish: 'gloss' },
      dresser: { color: '#2b2e33', finish: 'gloss', handle: 'recessed' },
      bookshelf: { color: '#2b2e33', finish: 'gloss' },
      desk: { color: '#2b2e33', finish: 'gloss' },
      'tv-console': { color: '#1c1f24', finish: 'gloss' },
      'wardrobe-3door': { color: '#2b2e33', doorStyle: 'sliding' },
      curtains: { color: '#4a4e54' },
    },
    extraItems: [
      {
        id: 'mono-feature',
        defId: 'feature-wall',
        position: [12.53, 2.45],
        rotation: -Math.PI / 2,
        props: { width: 3.0, height: 2.55, style: 'slat', color: '#23262b', finish: 'gloss' },
      },
    ],
  },
]

/** Hydrate one entry: schema defaults < the entry's own props < an optional
 *  per-defId style override (highest precedence). */
function hydrate(entry: LayoutEntry, style: Record<string, ParamProps>): LayoutEntry {
  const def = BUILTIN_CATALOG[entry.defId]
  const base = def?.kind === 'parametric' ? defaultParamProps(def) : {}
  const override = style[entry.defId] ?? {}
  return { ...entry, props: { ...base, ...entry.props, ...override } }
}

/** Build the fully-hydrated, restyled item list for a preset. For every room
 *  with a re-modelled arrangement (`rooms`, plus the `livingDining` sugar) the
 *  matching default items (by id prefix) are dropped and the authored entries
 *  are used as-is (no style override); all other default items are restyled in
 *  place. `extraItems` are appended last. */
export function buildPresetItems(preset: LayoutPreset): LayoutEntry[] {
  const overrides: Partial<Record<RoomId, LayoutEntry[]>> = { ...(preset.rooms ?? {}) }
  if (preset.livingDining) overrides.livingDining = preset.livingDining

  const droppedPrefixes = (Object.keys(overrides) as RoomId[])
    .map((r) => ROOM_PREFIX[r])
    .filter((p): p is string => Boolean(p))
    .map((p) => `${p}-`)

  const others = defaultLayout()
    .filter((e) => !droppedPrefixes.some((p) => e.id.startsWith(p)))
    .map((e) => hydrate(e, preset.style))
  const overrideItems = (Object.values(overrides).flat() as LayoutEntry[]).map((e) =>
    hydrate(e, {}),
  )

  let items = [...others, ...overrideItems]
  if (preset.extraItems) items = [...items, ...preset.extraItems.map((e) => hydrate(e, {}))]
  return items
}
