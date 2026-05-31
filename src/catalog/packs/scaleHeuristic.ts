/**
 * Per-pack scale resolution.
 *
 * Kenney's Furniture Kit is unevenly scaled: beds and large dining tables
 * happen to land near 1 unit = 1 m, but most seating, storage, kitchen
 * appliances, lamps, and bath fixtures are built on a half-meter visual
 * grid, leaving them roughly half real-world size when rendered at scale=1.
 *
 * Rather than apply a global multiplier (which would inflate the
 * already-correct items), we ship a curated per-id override table keyed
 * on Kenney's local entry id. Items not in the table render at scale=1.
 *
 * Targets are chosen so the longest horizontal axis matches a typical
 * real-world dimension — see [src/catalog/packs/__tests__/scaleHeuristic
 * .test.ts] for the cross-check against measured GLB bounding boxes.
 */
import type { Footprint } from './footprint'

const KENNEY_FURNITURE_KIT_SCALES: Record<string, number> = {
  // ── Seating (sofas, armchairs, benches, stools, dining chairs) ──────────
  loungeSofa: 2.0,
  loungeSofaCorner: 2.0,
  loungeSofaLong: 2.2,
  loungeSofaOttoman: 1.8,
  loungeChair: 1.8,
  loungeChairRelax: 1.4,
  loungeDesignChair: 1.4,
  loungeDesignSofa: 1.8,
  loungeDesignSofaCorner: 1.8,
  bench: 1.8,
  benchCushion: 1.8,
  benchCushionLow: 1.8,
  chair: 2.0,
  chairCushion: 2.0,
  chairCross: 2.0,
  chairDesk: 2.0,
  chairModernCushion: 2.0,
  chairModernFrameCushion: 2.0,
  chairRounded: 2.0,
  stoolBar: 1.7,
  stoolBarSquare: 1.7,
  // ── Tables and desks ────────────────────────────────────────────────────
  desk: 1.9,
  deskCorner: 1.6,
  table: 1.0, // 0.84 × 0.45, already a small dining table
  tableCloth: 1.0,
  tableGlass: 1.0,
  tableCoffee: 1.5,
  tableCoffeeGlass: 1.5,
  tableCoffeeGlassSquare: 1.5,
  tableCoffeeSquare: 1.5,
  tableRound: 1.6,
  // tableCross / tableCrossCloth at 2.03 × 1.07 are already correct.
  sideTable: 1.0,
  sideTableDrawers: 1.0,
  // ── Storage (bookcases, cabinets, racks) ────────────────────────────────
  bookcaseClosed: 2.0,
  bookcaseClosedDoors: 2.0,
  bookcaseClosedWide: 2.0,
  bookcaseOpen: 2.0,
  bookcaseOpenLow: 2.0,
  cabinetBed: 2.0,
  cabinetBedDrawer: 2.0,
  cabinetBedDrawerTable: 2.0,
  cabinetTelevision: 1.5,
  cabinetTelevisionDoors: 1.5,
  coatRack: 2.0,
  coatRackStanding: 2.0,
  // ── Kitchen appliances and cabinets (target 0.6 m base unit) ────────────
  kitchenStove: 1.4,
  kitchenStoveElectric: 1.4,
  kitchenFridge: 1.9,
  kitchenFridgeBuiltIn: 1.9,
  kitchenFridgeLarge: 1.4,
  kitchenFridgeSmall: 1.4,
  kitchenSink: 1.4,
  kitchenBar: 1.4,
  kitchenBarEnd: 1.4,
  kitchenCabinet: 1.4,
  kitchenCabinetCornerInner: 1.4,
  kitchenCabinetCornerRound: 1.4,
  kitchenCabinetDrawer: 1.4,
  kitchenCabinetUpper: 1.4,
  kitchenCabinetUpperCorner: 1.4,
  kitchenCabinetUpperDouble: 1.4,
  kitchenCabinetUpperLow: 1.4,
  kitchenMicrowave: 1.5,
  kitchenBlender: 1.5,
  kitchenCoffeeMachine: 1.5,
  hoodLarge: 1.4,
  hoodModern: 1.4,
  // ── Bath fixtures ───────────────────────────────────────────────────────
  bathtub: 1.5,
  bathroomCabinet: 1.5,
  bathroomCabinetDrawer: 1.5,
  bathroomMirror: 1.5,
  bathroomSink: 1.5,
  bathroomSinkSquare: 1.5,
  toiletSquare: 1.5,
  // toilet at 1.00 × 0.79 × 0.95 already real-world sized; leave at 1.
  // shower / showerRound already plausible.
  // ── Lighting ────────────────────────────────────────────────────────────
  lampRoundFloor: 1.8,
  lampSquareFloor: 1.8,
  lampRoundTable: 1.4,
  lampSquareTable: 1.4,
  // lampWall, lampSquareCeiling left at 1.
  // ── Laundry ─────────────────────────────────────────────────────────────
  washer: 1.5,
  dryer: 1.5,
  washerDryerStacked: 1.5,
  // ── Decor / electronics: leave at 1 (small accessories are stylised). ───
}

const KIT_SCALE_TABLES: Record<string, Record<string, number>> = {
  'kenney-furniture-kit': KENNEY_FURNITURE_KIT_SCALES,
}

/**
 * Returns the multiplier to apply to a pack entry's GLB at render time.
 * Defaults to 1 for unknown packs / entries — call sites must multiply
 * the raw GLB footprint by this value before persisting it for placement
 * collision.
 */
export function packEntryScale(packId: string, entryId: string): number {
  const table = KIT_SCALE_TABLES[packId]
  if (!table) return 1
  return table[entryId] ?? 1
}

/** Convenience: scaled footprint = raw bbox × scale, axis-wise. */
export function scaledFootprint(raw: Footprint, scale: number): Footprint {
  return { w: raw.w * scale, d: raw.d * scale, h: raw.h * scale }
}
