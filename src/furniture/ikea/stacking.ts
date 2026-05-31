/**
 * Snug-stacking math for compatible IKEA models. resolveStack derives where the
 * BOTTOM of a stacked item (mattress) rests on a base (bed frame): the support
 * surface Y, an XZ centre offset (so the mattress centres on the support area,
 * not the headboard-skewed bbox), and the inherited rotation. Measurement-
 * derived where IKEA exposes the numbers, else a per-category fallback.
 * Pure + render-free — see stacking.test.ts.
 */
import type { FurnitureCategory, FurnitureItem } from '../types';
import type { IkeaGltfDef, IkeaVariant } from '../types';
import { STACK } from '../../layout/designRules';
import { variantProps } from '../../ui/inspector/ikeaBodyProps';

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

export type StackResult =
  | { item: FurnitureItem; groupId: string }
  | { error: string };

function newStackId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `stack-${Math.random().toString(36).slice(2, 10)}`;
}

/** Build the FurnitureItem for `topDef`/`topVariant` stacked on `baseItem`.
 *  Position centres on the base support area (offset rotated by base rotation),
 *  rotation inherits the base, Y lift via props.surfaceHeight, and a shared
 *  groupId (reused from the base if it already has one). The caller adds the
 *  item to the store and stamps the base's groupId in one history step. */
export function stackOnto(
  baseItem: FurnitureItem,
  baseDef: IkeaGltfDef,
  topDef: IkeaGltfDef,
  topVariant: IkeaVariant,
): StackResult {
  const baseVariant =
    baseDef.variants.find((v) => v.finish === (baseItem.props['variant'] ?? baseDef.activeVariant)) ??
    baseDef.variants[0];
  // A malformed def with no variants would make resolveStack read footprint off
  // undefined; fail soft so a stuck drag / crash can't result.
  if (!baseVariant || !topVariant) return { error: `Missing variant for ${topDef.name} on ${baseDef.name}.` };
  const fit = resolveStack(baseDef, baseVariant, topDef, topVariant);
  if (!fit) return { error: `No snug fit for ${topDef.name} on ${baseDef.name}.` };

  const [dx, dz] = fit.centerOffset;
  const cos = Math.cos(baseItem.rotation);
  const sin = Math.sin(baseItem.rotation);
  const wx = baseItem.position[0] + dx * cos - dz * sin;
  const wz = baseItem.position[1] + dx * sin + dz * cos;

  const groupId = baseItem.groupId ?? newStackId();

  const item: FurnitureItem = {
    id: newStackId(),
    defId: topDef.id,
    position: [wx, wz],
    rotation: baseItem.rotation + fit.rotation,
    groupId,
    props: { ...variantProps(topVariant.finish), surfaceHeight: fit.supportY },
  };
  return { item, groupId };
}
