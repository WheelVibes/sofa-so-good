/**
 * Snug-stacking math for compatible IKEA models. resolveStack derives where the
 * BOTTOM of a stacked item (mattress) rests on a base (bed frame): the support
 * surface Y, an XZ centre offset (so the mattress centres on the support area,
 * not the headboard-skewed bbox), and the inherited rotation. Measurement-
 * derived where IKEA exposes the numbers, else a per-category fallback.
 * Pure + render-free — see stacking.test.ts.
 */
import type { FurnitureCategory } from '../types';
import type { IkeaGltfDef, IkeaVariant } from '../types';
import { STACK } from '../../layout/designRules';

export interface StackFit {
  /** Y (metres) where the bottom of the stacked item rests. */
  supportY: number;
  /** [dx, dz] in the BASE's local (unrotated) frame, base-centre → support-centre. */
  centerOffset: [number, number];
  /** Stacked item inherits the base rotation (delta is 0 here; caller adds base rotation). */
  rotation: number;
}

/** Parse "38 cm" → metres; undefined when absent/unparseable. */
function cmToM(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const m = /([\d.]+)\s*cm/i.exec(value);
  return m ? parseFloat(m[1]) / 100 : undefined;
}

function measurements(def: IkeaGltfDef): Record<string, string> {
  return def.productInfo?.productMeasurements ?? {};
}

/** Support-surface Y for the bottom of the stacked item, by base category. */
function supportSurfaceY(
  baseDef: IkeaGltfDef,
  baseVariant: IkeaVariant,
  topThickness: number,
): number | null {
  const pm = measurements(baseDef);
  const baseH = baseVariant.footprint?.h ?? baseDef.defaultFootprint.h;
  const freeUnder = cmToM(pm['Free height under furniture']) ?? 0;

  switch (baseDef.category as FurnitureCategory) {
    case 'beds': {
      const footboard = cmToM(pm['Footboard height']);
      // Top is flush with the footboard rail: the mattress bottom rests
      // `footboard - thickness` above the floor. When the footboard is shorter
      // than the mattress (implausible / missing rail) that goes negative, so
      // clamp up to the free height under the frame (the slatted-base plane).
      if (footboard === undefined) return STACK.bedSlatDefault;
      const y = footboard - topThickness;
      return y < 0 ? freeUnder : y;
    }
    case 'seating':
      return STACK.seatDefault;
    default:
      return baseH;
  }
}

/** XZ offset (base local frame) centring the top on the base's support area. */
function centerOffset(baseVariant: IkeaVariant): [number, number] {
  const ao = baseVariant.footprint?.anchorOffset ?? [0, 0, 0];
  return [ao[0], ao[2]];
}

export function resolveStack(
  baseDef: IkeaGltfDef,
  baseVariant: IkeaVariant,
  topDef: IkeaGltfDef,
  topVariant: IkeaVariant,
): StackFit | null {
  if (!baseDef.compatibility?.acceptsCategories?.length) return null;
  const topThickness = topVariant.footprint?.h ?? topDef.defaultFootprint.h;
  const supportY = supportSurfaceY(baseDef, baseVariant, topThickness);
  if (supportY === null) return null;
  return { supportY, centerOffset: centerOffset(baseVariant), rotation: 0 };
}
