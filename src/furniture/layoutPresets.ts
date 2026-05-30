import type { MaterialId } from '../materials/types';
import type { RoomId } from '../apartment/types';
import type { LayoutEntry } from './defaults/types';
import type { ParamProps } from './types';
import { defaultLayout } from './defaultLayout';
import { BUILTIN_CATALOG } from './builtinCatalog';
import { defaultParamProps } from './types';

/**
 * Full-flat layout presets. Rather than re-author every placement, a preset
 * reuses the curated default positions and restyles them: it overrides the
 * cosmetic props (colour / material / finish / weave / shape) per item type
 * and sets a coordinated floor + wall palette across the living spaces. This
 * keeps every preset collision-valid (identical positions to the move-in
 * default) while producing a distinct, cohesive interior-design look.
 */
export interface LayoutPreset {
  id: string;
  name: string;
  description: string;
  /** Floor finish for the dry living spaces. */
  dryFloor: MaterialId;
  /** Wall paint for the dry living spaces. */
  wall: MaterialId;
  /** Per-defId cosmetic prop overrides merged onto the default items. */
  style: Record<string, ParamProps>;
}

/** Rooms a preset restyles (the "designed" living spaces; wet/utility rooms
 *  keep their hard-wearing finishes). Mirrors STYLE_ROOMS. */
export const PRESET_ROOMS: RoomId[] = [
  'mainBedroom',
  'bedroom2',
  'bedroom3',
  'livingDining',
  'corridor',
];

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
      'sofa-3seat': { color: '#d6d4cc', material: 'fabric', pattern: 'plain', pillowColor: '#9bb0a6' },
      armchair: { color: '#cfcabb', material: 'fabric', style: 'standard' },
      'dining-chair': { style: 'wood', seatColor: '#cdb696', finish: 'wood' },
      rug: { color: '#e6e0d2', borderColor: '#cdbfa6', pattern: 'herringbone' },
      'coffee-table': { color: '#cdb696', finish: 'wood', shape: 'oval' },
      'side-table': { topColor: '#cdb696', finish: 'wood' },
      'dining-table-4': { topColor: '#cdb696', legColor: '#b39a72' },
      'bed-queen': { frameColor: '#cdb696', beddingColor: '#eceae2', headboardStyle: 'upholstered', pillowColor: '#ffffff' },
      'bed-single': { frameColor: '#cdb696', beddingColor: '#eceae2', headboardStyle: 'upholstered' },
      'bed-double': { frameColor: '#cdb696', beddingColor: '#eceae2', headboardStyle: 'upholstered' },
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
      'sofa-3seat': { color: '#3f6b5e', material: 'fabric', pattern: 'plain', pillowColor: '#c4683f' },
      armchair: { color: '#caa46a', material: 'fabric', style: 'wingback' },
      'dining-chair': { style: 'wood', seatColor: '#9a6b3f', finish: 'wood' },
      rug: { color: '#b4a890', borderColor: '#5a4a32', pattern: 'plain' },
      'coffee-table': { color: '#9a6b3f', finish: 'wood', shape: 'round' },
      'side-table': { topColor: '#9a6b3f', finish: 'wood' },
      'dining-table-4': { topColor: '#9a6b3f', legColor: '#6b4f34' },
      'bed-queen': { frameColor: '#9a6b3f', beddingColor: '#cfc3a8', throwColor: '#b5683f', headboardStyle: 'upholstered' },
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
    id: 'modern-mono',
    name: 'Modern Mono',
    description: 'Grey porcelain, charcoal walls, glossy monochrome.',
    dryFloor: 'floor-tile-grey',
    wall: 'wall-paint-charcoal',
    style: {
      'sofa-3seat': { color: '#2c2e30', material: 'fabric', pattern: 'plain', pillowColor: '#9aa0a6' },
      armchair: { color: '#3a3d42', material: 'velvet', sheen: 0.4, style: 'tub' },
      'dining-chair': { style: 'upholstered', seatColor: '#2c2e30' },
      rug: { color: '#5a5e63', borderColor: '#2b2b2b', pattern: 'plain' },
      'coffee-table': { color: '#1c1f24', finish: 'gloss' },
      'side-table': { topColor: '#1c1f24', finish: 'gloss', shape: 'drum' },
      'dining-table-4': { topColor: '#2b2e33', legColor: '#1c1f24', finish: 'gloss' },
      'bed-queen': { frameColor: '#2b2e33', beddingColor: '#9aa0a6', headboardStyle: 'upholstered' },
      'bed-single': { frameColor: '#2b2e33', beddingColor: '#9aa0a6', headboardStyle: 'upholstered' },
      'bed-double': { frameColor: '#2b2e33', beddingColor: '#9aa0a6', headboardStyle: 'upholstered' },
      nightstand: { color: '#2b2e33', finish: 'gloss' },
      dresser: { color: '#2b2e33', finish: 'gloss', handle: 'recessed' },
      bookshelf: { color: '#2b2e33', finish: 'gloss' },
      desk: { color: '#2b2e33', finish: 'gloss' },
      'tv-console': { color: '#1c1f24', finish: 'gloss' },
      'wardrobe-3door': { color: '#2b2e33', doorStyle: 'sliding' },
      curtains: { color: '#4a4e54' },
    },
  },
];

/** Build the fully-hydrated, restyled item list for a preset (default
 *  positions + schema defaults + the item's own overrides + the preset
 *  style override, in increasing precedence). */
export function buildPresetItems(preset: LayoutPreset): LayoutEntry[] {
  return defaultLayout().map((entry) => {
    const def = BUILTIN_CATALOG[entry.defId];
    const base = def?.kind === 'parametric' ? defaultParamProps(def) : {};
    const override = preset.style[entry.defId] ?? {};
    return { ...entry, props: { ...base, ...entry.props, ...override } };
  });
}
