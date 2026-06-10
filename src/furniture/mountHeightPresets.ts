/**
 * Standard mount-height presets for wall/ceiling-mounted items — the
 * interior-design conventions a designer reaches for (gallery picture-centre
 * 1.45 m, TV seated-eye 1.1 m, pendant-over-table 1.5 m, …). Pure + data-only so
 * it's unit-testable and reused by the inspector's `mountHeight` control.
 *
 * Heights are the value the matching primitive interprets as `mountHeight`
 * (centre height for art/mirrors, underside for cabinets/hoods, panel-centre for
 * TVs) — i.e. they map 1:1 onto the param the slider already drives. Presets are
 * filtered to the field's [min,max] at the call site so none land out of range.
 */

export interface MountPreset {
  /** Short chip label, e.g. "Gallery 1.45 m". */
  label: string
  /** Metres — the `mountHeight` prop value. */
  height: number
}

interface PresetGroup {
  /** Matches the item's defId (lower-cased). First match wins. */
  test: RegExp
  presets: MountPreset[]
}

// Ordered most-specific → most-generic; the first whose `test` matches wins.
const GROUPS: PresetGroup[] = [
  {
    // Flat-screen TVs — panel centre. Lower than art: seated viewing.
    test: /\btv\b|flatscreen|television/,
    presets: [
      { label: 'Seated eye 1.1 m', height: 1.1 },
      { label: 'Standard 1.2 m', height: 1.2 },
      { label: 'Console-top 0.9 m', height: 0.9 },
    ],
  },
  {
    // Picture art, tapestry, wall clock — gallery convention centres the piece
    // ~1.45 m (≈57–60") off the floor regardless of ceiling height.
    test: /art|picture|painting|poster|tapestry|frame|clock/,
    presets: [
      { label: 'Gallery 1.45 m', height: 1.45 },
      { label: 'Eye level 1.6 m', height: 1.6 },
      { label: 'Above sofa 1.5 m', height: 1.5 },
    ],
  },
  {
    test: /mirror/,
    presets: [
      { label: 'Centre 1.5 m', height: 1.5 },
      { label: 'Over vanity 1.35 m', height: 1.35 },
    ],
  },
  {
    test: /sconce|wall-light|wall-lamp/,
    presets: [
      { label: 'Sconce 1.65 m', height: 1.65 },
      { label: 'Bedside 1.4 m', height: 1.4 },
    ],
  },
  {
    test: /shelf|ledge/,
    presets: [
      { label: 'Shelf 1.4 m', height: 1.4 },
      { label: 'Above desk 1.1 m', height: 1.1 },
    ],
  },
  {
    // Pendants / hanging plants / chandeliers — hang point above the floor.
    test: /pendant|chandelier|hanging|drop-light/,
    presets: [
      { label: 'Over table 1.5 m', height: 1.5 },
      { label: 'Walkway 2.1 m', height: 2.1 },
    ],
  },
  {
    test: /ceiling|fan/,
    presets: [
      { label: 'Ceiling 2.55 m', height: 2.55 },
      { label: 'Low ceiling 2.4 m', height: 2.4 },
    ],
  },
  {
    test: /cabinet|cupboard/,
    presets: [
      { label: 'Worktop +0.5 (1.45 m)', height: 1.45 },
      { label: 'Tall 1.6 m', height: 1.6 },
    ],
  },
  {
    test: /hood|extractor/,
    presets: [
      { label: 'Hob +0.7 (1.45 m)', height: 1.45 },
      { label: 'High 1.55 m', height: 1.55 },
    ],
  },
  {
    test: /aircon|air-con|hvac/,
    presets: [
      { label: 'High wall 2.25 m', height: 2.25 },
      { label: 'Ceiling 2.5 m', height: 2.5 },
    ],
  },
  {
    test: /soundbar|speaker/,
    presets: [
      { label: 'Under TV 1.0 m', height: 1.0 },
      { label: 'Shelf 1.4 m', height: 1.4 },
    ],
  },
  {
    test: /towel|rail|ladder/,
    presets: [
      { label: 'Towel 1.1 m', height: 1.1 },
      { label: 'High 1.4 m', height: 1.4 },
    ],
  },
]

/** Generic fall-back for any mounted item not matched above. */
const GENERIC: MountPreset[] = [
  { label: 'Low 1.1 m', height: 1.1 },
  { label: 'Mid 1.45 m', height: 1.45 },
  { label: 'High 1.7 m', height: 1.7 },
]

/** Designer mount-height presets for an item, by its def id. Always returns at
 *  least the generic set, so the control can render whenever a `mountHeight`
 *  param exists. */
export function mountHeightPresets(defId: string): MountPreset[] {
  const id = defId.toLowerCase()
  const group = GROUPS.find((g) => g.test.test(id))
  return group ? group.presets : GENERIC
}

/** Presets clamped to an inclusive [min,max] range (drops any out-of-range), so
 *  the inspector never offers a height the slider can't represent. */
export function mountHeightPresetsInRange(defId: string, min: number, max: number): MountPreset[] {
  return mountHeightPresets(defId).filter((p) => p.height >= min && p.height <= max)
}
