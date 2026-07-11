/**
 * Magic design suggestions (feature F16) — rule-based, no ML.
 *
 * Contextual "what to add" hints in the spirit of Planner 5D's Smart Wizard or
 * Coohom's decorator. Given each room's name, area, and the furniture CATEGORY
 * strings currently placed in it, we infer the room's kind and run a
 * data-driven rule set to produce friendly, actionable suggestions.
 *
 * Pure + deterministic: same input always yields the same output. The caller
 * derives the category list (e.g. from placed furniture) and renders the
 * resulting tips; `addCategory` lets a UI deep-link to a catalog filter.
 *
 * Self-contained — no furniture/catalog imports. Category strings are treated
 * as opaque tags (e.g. 'seating', 'tables', 'beds', 'lighting', 'storage',
 * 'textiles', 'kitchen', 'bathroom', 'media', 'decor', 'outdoor').
 */

/** A room as seen by the suggester. Categories are opaque catalog tags. */
interface SuggestionRoom {
  id: string
  name: string
  /** Interior floor area in square metres. */
  areaSqm: number
  /** Furniture category strings currently placed in this room. */
  itemCategories: string[]
}

export interface SuggestionInput {
  rooms: SuggestionRoom[]
}

export interface Suggestion {
  roomId: string
  roomName: string
  /** 'tip' = something is missing/off; 'idea' = optional styling nicety. */
  severity: 'tip' | 'idea'
  message: string
  /** Catalog category a UI could filter to, when the suggestion is "add X". */
  addCategory?: string
}

/** Coarse room kind inferred from the room's name. */
export type RoomKind =
  | 'living'
  | 'dining'
  | 'bedroom'
  | 'kitchen'
  | 'bath'
  | 'study'
  | 'balcony'
  | 'other'

/** Kinds we never nag to furnish (external / service / utility spaces). */
const NON_HABITABLE: ReadonlySet<RoomKind> = new Set<RoomKind>(['balcony'])

/**
 * Infer a room's kind from its name (mirrors the app's `roomKindFromName`
 * conventions, extended with dining / study / balcony / other). Order matters:
 * more specific patterns win.
 */
export function roomKindFromName(name: string | undefined): RoomKind {
  if (!name) return 'other'
  const n = name.toLowerCase()
  if (/(balcony|ledge|shelter|yard|\bstore\b|storeroom|service|utility|bin)/.test(n)) {
    return 'balcony'
  }
  if (/\b(kitchen|kitchenette|pantry)\b/.test(n)) return 'kitchen'
  if (/(bath|\bwc\b|toilet|powder|en-?suite|shower)/.test(n)) return 'bath'
  if (/(study|office|\bwork\b|den|library)/.test(n)) return 'study'
  // 'living' is checked before 'dining' so a combined "Living / Dining" room
  // reads as living (the superset use) rather than dining-only.
  if (/(living|lounge|family\s?room|great\s?room|hall)/.test(n)) return 'living'
  if (/(dining|\bdine\b)/.test(n)) return 'dining'
  if (/(bed\s?room|\bbed\b|master|nursery|guest)/.test(n)) return 'bedroom'
  return 'other'
}

interface RuleContext {
  kind: RoomKind
  areaSqm: number
  categories: ReadonlySet<string>
  has: (cat: string) => boolean
  /** Number of distinct categories present. */
  variety: number
}

/** A single suggestion rule. */
interface SuggestionRule {
  id: string
  /** Kinds this rule applies to; omit to apply to every habitable kind. */
  kinds?: RoomKind[]
  severity: 'tip' | 'idea'
  message: string
  addCategory?: string
  /** Whether the rule fires for this room. */
  when: (ctx: RuleContext) => boolean
  /** Optional dynamic message (overrides `message` when it returns a string). */
  buildMessage?: (ctx: RuleContext) => string
}

/** Area (m²) above which a room with little variety reads as "sparse". */
const SPARSE_AREA_SQM = 12
/** A room with this many distinct categories or fewer counts as bare. */
const SPARSE_VARIETY = 2

/**
 * The rule set — data-driven + extensible. Add a rule here and it is picked up
 * automatically. Rules are evaluated in order. An empty room only fires its
 * single `empty-*` rule (handled in `buildSuggestions`), so a bare room isn't
 * buried under every missing-X tip.
 */
const SUGGESTION_RULES: readonly SuggestionRule[] = [
  // --- Empty habitable room: suggest the core kit for its kind. -------------
  {
    id: 'empty-living',
    kinds: ['living'],
    severity: 'tip',
    message: 'Furnish this room — start with a sofa, coffee table, and a media unit.',
    addCategory: 'seating',
    when: (c) => c.categories.size === 0,
  },
  {
    id: 'empty-dining',
    kinds: ['dining'],
    severity: 'tip',
    message: 'Furnish this room — add a dining table and chairs.',
    addCategory: 'tables',
    when: (c) => c.categories.size === 0,
  },
  {
    id: 'empty-bedroom',
    kinds: ['bedroom'],
    severity: 'tip',
    message: 'Furnish this room — start with a bed, nightstands, and a wardrobe.',
    addCategory: 'beds',
    when: (c) => c.categories.size === 0,
  },
  {
    id: 'empty-kitchen',
    kinds: ['kitchen'],
    severity: 'tip',
    message: 'Furnish this room — add kitchen cabinetry and appliances.',
    addCategory: 'kitchen',
    when: (c) => c.categories.size === 0,
  },
  {
    id: 'empty-bath',
    kinds: ['bath'],
    severity: 'tip',
    message: 'Furnish this room — add the core bathroom fixtures.',
    addCategory: 'bathroom',
    when: (c) => c.categories.size === 0,
  },
  {
    id: 'empty-study',
    kinds: ['study'],
    severity: 'tip',
    message: 'Furnish this room — start with a desk, chair, and storage.',
    addCategory: 'tables',
    when: (c) => c.categories.size === 0,
  },
  {
    id: 'empty-other',
    kinds: ['other'],
    severity: 'idea',
    message: 'Furnish this room to bring it to life.',
    addCategory: 'seating',
    when: (c) => c.categories.size === 0,
  },

  // --- Living room ----------------------------------------------------------
  {
    id: 'living-coffee-table',
    kinds: ['living'],
    severity: 'tip',
    message: 'Add a coffee table to anchor the seating.',
    addCategory: 'tables',
    when: (c) => c.has('seating') && !c.has('tables'),
  },
  {
    id: 'living-rug',
    kinds: ['living'],
    severity: 'idea',
    message: 'Add a rug to anchor the seating area.',
    addCategory: 'textiles',
    when: (c) => c.has('seating') && c.has('media') && !c.has('textiles'),
  },
  {
    id: 'living-lighting',
    kinds: ['living'],
    severity: 'tip',
    message: 'Add ambient + task lighting for evenings.',
    addCategory: 'lighting',
    when: (c) => !c.has('lighting'),
  },
  {
    id: 'living-decor',
    kinds: ['living'],
    severity: 'idea',
    message: 'Style with plants or art to add personality.',
    addCategory: 'decor',
    when: (c) => !c.has('decor'),
  },

  // --- Bedroom --------------------------------------------------------------
  {
    id: 'bedroom-nightstands',
    kinds: ['bedroom'],
    severity: 'tip',
    message: 'Add nightstands beside the bed.',
    addCategory: 'storage',
    when: (c) => c.has('beds') && !c.has('storage'),
  },
  {
    id: 'bedroom-wardrobe',
    kinds: ['bedroom'],
    severity: 'tip',
    message: 'Add a wardrobe for clothes storage.',
    addCategory: 'storage',
    when: (c) => !c.has('storage'),
  },
  {
    id: 'bedroom-lighting',
    kinds: ['bedroom'],
    severity: 'tip',
    message: 'Add bedside lighting for a cosy glow.',
    addCategory: 'lighting',
    when: (c) => !c.has('lighting'),
  },

  // --- Dining ---------------------------------------------------------------
  {
    id: 'dining-chairs',
    kinds: ['dining'],
    severity: 'tip',
    message: 'Add dining chairs around the table.',
    addCategory: 'seating',
    when: (c) => c.has('tables') && !c.has('seating'),
  },
  {
    id: 'dining-lighting',
    kinds: ['dining'],
    severity: 'idea',
    message: 'Add a pendant light over the table.',
    addCategory: 'lighting',
    when: (c) => c.has('tables') && !c.has('lighting'),
  },

  // --- Kitchen --------------------------------------------------------------
  {
    id: 'kitchen-core',
    kinds: ['kitchen'],
    severity: 'tip',
    message: 'Add kitchen cabinetry and appliances.',
    addCategory: 'kitchen',
    when: (c) => c.categories.size > 0 && !c.has('kitchen'),
  },
  {
    id: 'kitchen-storage',
    kinds: ['kitchen'],
    severity: 'idea',
    message: 'Add cabinets or shelving for more storage.',
    addCategory: 'storage',
    when: (c) => c.has('kitchen') && !c.has('storage'),
  },

  // --- Bath -----------------------------------------------------------------
  {
    id: 'bath-core',
    kinds: ['bath'],
    severity: 'tip',
    message: 'Add the core bathroom fixtures.',
    addCategory: 'bathroom',
    when: (c) => c.categories.size > 0 && !c.has('bathroom'),
  },

  // --- Study ----------------------------------------------------------------
  {
    id: 'study-desk',
    kinds: ['study'],
    severity: 'tip',
    message: 'Add a desk to set up the workspace.',
    addCategory: 'tables',
    when: (c) => c.categories.size > 0 && !c.has('tables'),
  },
  {
    id: 'study-seating',
    kinds: ['study'],
    severity: 'tip',
    message: 'Add a desk chair.',
    addCategory: 'seating',
    when: (c) => c.has('tables') && !c.has('seating'),
  },
  {
    id: 'study-storage',
    kinds: ['study'],
    severity: 'idea',
    message: 'Add shelving or storage for books and files.',
    addCategory: 'storage',
    when: (c) => c.categories.size > 0 && !c.has('storage'),
  },

  // --- Balcony / outdoor (allowed, but never a furnishing nag). -------------
  {
    id: 'balcony-outdoor',
    kinds: ['balcony'],
    severity: 'idea',
    message: 'Add outdoor seating or planters to enjoy the space.',
    addCategory: 'outdoor',
    when: (c) => !c.has('outdoor') && !c.has('seating'),
  },

  // --- Cross-cutting: sparse large room. ------------------------------------
  {
    id: 'sparse',
    severity: 'idea',
    message: 'Room looks sparse — add more pieces to fill it out.',
    when: (c) =>
      c.areaSqm > SPARSE_AREA_SQM && c.categories.size > 0 && c.variety <= SPARSE_VARIETY,
  },
]

/** Whether a rule applies to a given room kind. */
function ruleAppliesToKind(rule: SuggestionRule, kind: RoomKind): boolean {
  return rule.kinds ? rule.kinds.includes(kind) : !NON_HABITABLE.has(kind)
}

/**
 * Build contextual design suggestions for a set of rooms. Pure + deterministic;
 * returns `[]` for empty/missing input. External/utility rooms are skipped for
 * furnishing nags (balconies may still suggest 'outdoor').
 */
export function buildSuggestions(input: SuggestionInput | null | undefined): Suggestion[] {
  const rooms = input?.rooms
  if (!Array.isArray(rooms) || rooms.length === 0) return []

  const out: Suggestion[] = []
  for (const room of rooms) {
    if (!room) continue
    const kind = roomKindFromName(room.name)
    const categories = new Set(
      (Array.isArray(room.itemCategories) ? room.itemCategories : []).filter(
        (c): c is string => typeof c === 'string' && c.length > 0,
      ),
    )
    const ctx: RuleContext = {
      kind,
      areaSqm: Number.isFinite(room.areaSqm) ? Math.max(0, room.areaSqm) : 0,
      categories,
      has: (cat) => categories.has(cat),
      variety: categories.size,
    }

    const isEmpty = categories.size === 0
    for (const rule of SUGGESTION_RULES) {
      if (!ruleAppliesToKind(rule, kind)) continue
      // An empty room fires only its single `empty-*` rule; non-empty rooms
      // skip the `empty-*` rules. This keeps a bare room from collecting every
      // missing-X tip at once.
      const isEmptyRule = rule.id.startsWith('empty-')
      if (isEmpty !== isEmptyRule) continue
      if (!rule.when(ctx)) continue
      const message = rule.buildMessage?.(ctx) ?? rule.message
      out.push({
        roomId: room.id,
        roomName: room.name,
        severity: rule.severity,
        message,
        ...(rule.addCategory ? { addCategory: rule.addCategory } : {}),
      })
    }
  }
  return out
}
