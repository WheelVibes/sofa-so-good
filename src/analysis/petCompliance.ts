/**
 * Pet compliance & essentials checklist (Pet program — Stage P6).
 *
 * A per-design household can declare which pet types it keeps (`PetType`);
 * this module derives a non-binding checklist of the fittings each declared
 * pet needs — Singapore regulatory REQUIRED items (e.g. the Cat Management
 * Framework window-mesh containment mandate, a litter provision), plus
 * comfort/enrichment RECOMMENDED items and INFO notes. It mirrors the style of
 * `hdbCompliance.ts`: a data-driven rule table (`PET_RULES`) over
 * `(petTypes, items, floorPlan)`, every threshold in one auditable const
 * (`PET_THRESHOLDS`), pure + fully unit-testable (no React / three / clocks).
 *
 * Counting is by placed-item `defId` only (the catalog isn't needed — a placed
 * item already carries its `defId`), and the cat window-mesh rule counts meshed
 * windows against the plan's window openings across every storey.
 *
 * Research base (see docs/pet-fittings-plan.md): Cat Management Framework (live
 * 1 Sep 2024, transition ends 31 Aug 2026) mandates meshing every window /
 * balcony; HDB allows 1 dog from the approved small-breed list and ≤2 cats per
 * flat; a filled aquarium is very heavy (~300 kg for a 1.2 m tank).
 */

import { planLevels } from '../floorplan/levels'
import type { FloorPlan } from '../floorplan/types'
import type { FurnitureItem } from '../furniture/types'

/** The pet types a household can declare. Matches the pet-type keyword
 *  vocabulary curated on the `pets` catalog defs (see furniture/defs/pets.ts),
 *  minus the umbrella `small-pet` grouping keyword. */
export type PetType = 'dog' | 'cat' | 'bird' | 'rabbit' | 'guinea-pig' | 'hamster' | 'fish'

/** Display order + membership of the profile multi-select. */
export const PET_TYPES: readonly PetType[] = [
  'dog',
  'cat',
  'bird',
  'rabbit',
  'guinea-pig',
  'hamster',
  'fish',
] as const

/** Human labels for each pet type (UI + report). */
export const PET_TYPE_LABEL: Record<PetType, string> = {
  dog: 'Dog',
  cat: 'Cat',
  bird: 'Bird',
  rabbit: 'Rabbit',
  'guinea-pig': 'Guinea pig',
  hamster: 'Hamster',
  fish: 'Fish',
}

/** True for a value that is one of the seven known pet types (input guard). */
export function isPetType(v: unknown): v is PetType {
  return typeof v === 'string' && (PET_TYPES as readonly string[]).includes(v)
}

/** A checklist entry's role. `required` = regulatory / welfare essential,
 *  `recommended` = comfort / enrichment, `info` = an advisory note with no
 *  pass/fail (always shown, never counted as missing). */
export type PetChecklistKind = 'required' | 'recommended' | 'info'

/** Fulfilment of a single entry. `partial` only occurs when `need > 1` (today,
 *  the cat window-mesh rule counting meshed windows vs. the plan's windows). */
export type PetChecklistStatus = 'done' | 'partial' | 'missing'

/** One derived checklist line for one pet type. */
export interface PetChecklistEntry {
  /** Stable id (`<petType>:<ruleId>`) so the UI can key/checkbox each row. */
  id: string
  petType: PetType
  kind: PetChecklistKind
  title: string
  detail: string
  /** Which regulation / guideline this references (shown as a muted cite line). */
  cite: string
  status: PetChecklistStatus
  /** How many satisfying items are placed (meshed windows for the mesh rule). */
  have: number
  /** How many are needed for `done` (window count for the mesh rule, else 1;
   *  `0` for `info` notes). */
  need: number
  /** Catalog def ids that satisfy this entry (drives the "Add" CTA + essentials). */
  defIds: string[]
}

/** The full pet-compliance report. */
export interface PetComplianceReport {
  entries: PetChecklistEntry[]
  /** Count of `required` entries still `missing`. */
  requiredMissing: number
  /** Count of `required` entries `partial` (some but not all). */
  requiredPartial: number
  /** Count of `required` entries fully `done`. */
  requiredDone: number
  /** Total `required` entries across the declared pet types. */
  requiredTotal: number
  /** Count of `recommended` entries not yet `done` (missing or partial). */
  recommendedOutstanding: number
}

/** Tunable thresholds, kept in one auditable place (mirrors hdbCompliance). */
export const PET_THRESHOLDS = {
  /** Each satisfying item needed for a simple required/recommended entry. */
  singleNeed: 1,
} as const

// Citations — one per regulation / guideline area.
const CITE_CMF =
  'AVS Cat Management Framework (window/balcony meshing mandatory from 1 Sep 2024; transition ends 31 Aug 2026)'
const CITE_CAT_WELFARE = 'AVS responsible cat ownership — litter, scratching & enrichment'
const CITE_HDB_DOG = 'HDB keeping of pets — 1 approved small-breed dog per flat'
const CITE_DOG_WELFARE = 'AVS responsible dog ownership — rest, containment & feeding'
const CITE_BIRD = 'AVS responsible bird ownership — housing & fly-out safety'
const CITE_SMALL_PET = 'AVS responsible small-mammal ownership — enclosure & exercise'
const CITE_FISH = 'Aquarium load — a filled tank is heavy; site on solid, level flooring'

/**
 * A single pet-fitting rule. `windows: true` marks the special cat window-mesh
 * rule whose `need` is the plan's window count and `have` the meshed count;
 * every other rule is `need = 1`, `have = placed count of its defIds`.
 */
interface PetRule {
  id: string
  petType: PetType
  kind: PetChecklistKind
  title: string
  detail: string
  cite: string
  /** Catalog def ids any one of which satisfies this rule. */
  defIds: string[]
  /** Count meshed windows against the plan's windows (cat CMF rule). */
  windows?: boolean
}

/**
 * The ordered rule table. Required rules first per pet type, then recommended,
 * then info. Add a fitting by appending a `PetRule`; the checklist, the report
 * summary, and the catalog essentials-surfacing all read from this table.
 */
const PET_RULES: readonly PetRule[] = [
  // ── Cat ──────────────────────────────────────────────────────────────────
  {
    id: 'window-mesh',
    petType: 'cat',
    kind: 'required',
    title: 'Mesh every window & balcony',
    detail:
      'Singapore’s Cat Management Framework requires cats to be kept safely indoors — mesh or screen every window, grille, balcony and service yard (aperture ≤5 cm, internally mounted). Fit a window mesh screen on each opening.',
    cite: CITE_CMF,
    defIds: ['window-mesh-screen'],
    windows: true,
  },
  {
    id: 'litter',
    petType: 'cat',
    kind: 'required',
    title: 'Provide a litter tray',
    detail:
      'Every cat home needs at least one litter box (open, covered or top-entry) — a concealment cabinet counts. Site it in a quiet, ventilated spot such as the service yard.',
    cite: CITE_CAT_WELFARE,
    defIds: ['litter-box', 'litter-cabinet'],
  },
  {
    id: 'scratching',
    petType: 'cat',
    kind: 'recommended',
    title: 'Add a scratching surface',
    detail:
      'A scratching post or cat tree saves your furniture and lets a cat stretch and mark. Sisal posts and angled boards both work.',
    cite: CITE_CAT_WELFARE,
    defIds: ['scratching-post', 'cat-tree'],
  },
  {
    id: 'vertical',
    petType: 'cat',
    kind: 'recommended',
    title: 'Give vertical territory',
    detail:
      'Cats feel safest up high. A cat tree or a run of wall shelves / steps / bridges adds climbing and perching space.',
    cite: CITE_CAT_WELFARE,
    defIds: ['cat-tree', 'cat-wall-shelf', 'cat-wall-steps', 'cat-wall-bridge'],
  },
  {
    id: 'window-perch',
    petType: 'cat',
    kind: 'recommended',
    title: 'Fit a window perch',
    detail:
      'A sill-height window perch lets a cat sunbathe and watch the outdoors safely behind the mesh.',
    cite: CITE_CAT_WELFARE,
    defIds: ['cat-window-perch'],
  },
  // ── Dog ──────────────────────────────────────────────────────────────────
  {
    id: 'rest-area',
    petType: 'dog',
    kind: 'required',
    title: 'Provide a rest area',
    detail:
      'A dog needs its own comfortable bed to rest and settle. An orthopedic dog bed or a pet bed both qualify.',
    cite: CITE_DOG_WELFARE,
    defIds: ['dog-bed-orthopedic', 'pet-bed'],
  },
  {
    id: 'containment',
    petType: 'dog',
    kind: 'recommended',
    title: 'Add containment',
    detail:
      'A pet gate or playpen keeps a dog out of the kitchen / off the stairs and gives a safe zone when you are out.',
    cite: CITE_DOG_WELFARE,
    defIds: ['pet-gate', 'pet-playpen'],
  },
  {
    id: 'feeding',
    petType: 'dog',
    kind: 'recommended',
    title: 'Set up a feeding station',
    detail:
      'A raised feeding station with food & water bowls keeps meals tidy and is easier on a larger dog’s neck.',
    cite: CITE_DOG_WELFARE,
    defIds: ['pet-feeding-station'],
  },
  {
    id: 'crate',
    petType: 'dog',
    kind: 'recommended',
    title: 'Consider a crate',
    detail:
      'A correctly sized crate (a wire crate or a furniture-style side-table crate) gives a den for training and calm rest.',
    cite: CITE_DOG_WELFARE,
    defIds: ['dog-crate'],
  },
  {
    id: 'hdb-approval',
    petType: 'dog',
    kind: 'info',
    title: 'HDB allows one approved small-breed dog',
    detail:
      'HDB flats may keep 1 dog from the list of 62 approved small breeds (Project ADORE). Confirm your dog is approved and licensed with NParks / AVS.',
    cite: CITE_HDB_DOG,
    defIds: [],
  },
  // ── Bird ─────────────────────────────────────────────────────────────────
  {
    id: 'cage',
    petType: 'bird',
    kind: 'required',
    title: 'Provide a cage',
    detail:
      'A bird needs a suitably sized cage or aviary with perches. Place it away from draughts and direct sun.',
    cite: CITE_BIRD,
    defIds: ['bird-cage'],
  },
  {
    id: 'play-gym',
    petType: 'bird',
    kind: 'recommended',
    title: 'Add a play gym',
    detail:
      'A tabletop play gym gives out-of-cage exercise and enrichment with perches, a ladder and rings.',
    cite: CITE_BIRD,
    defIds: ['bird-play-gym'],
  },
  {
    id: 'fly-out-safety',
    petType: 'bird',
    kind: 'recommended',
    title: 'Mesh windows for fly-out safety',
    detail:
      'Meshing your windows stops an escaped bird flying out of an open window during out-of-cage time.',
    cite: CITE_BIRD,
    defIds: ['window-mesh-screen'],
  },
  // ── Rabbit ───────────────────────────────────────────────────────────────
  {
    id: 'enclosure',
    petType: 'rabbit',
    kind: 'required',
    title: 'Provide an enclosure',
    detail:
      'A rabbit needs a hutch or a roomy C&C pen with a sheltered sleeping area and space to hop.',
    cite: CITE_SMALL_PET,
    defIds: ['rabbit-hutch', 'small-pet-pen'],
  },
  {
    id: 'playpen',
    petType: 'rabbit',
    kind: 'recommended',
    title: 'Add an exercise pen',
    detail: 'A playpen gives supervised free-roam exercise time outside the hutch each day.',
    cite: CITE_SMALL_PET,
    defIds: ['pet-playpen', 'small-pet-pen'],
  },
  // ── Guinea pig ───────────────────────────────────────────────────────────
  {
    id: 'enclosure',
    petType: 'guinea-pig',
    kind: 'required',
    title: 'Provide an enclosure',
    detail:
      'Guinea pigs need a large ground-level pen — a C&C pen (≥2×3 grids for a pair) or a hutch run.',
    cite: CITE_SMALL_PET,
    defIds: ['small-pet-pen', 'rabbit-hutch'],
  },
  {
    id: 'playpen',
    petType: 'guinea-pig',
    kind: 'recommended',
    title: 'Add an exercise pen',
    detail: 'A playpen gives supervised floor time and enrichment outside the main enclosure.',
    cite: CITE_SMALL_PET,
    defIds: ['pet-playpen', 'small-pet-pen'],
  },
  // ── Hamster ──────────────────────────────────────────────────────────────
  {
    id: 'tank',
    petType: 'hamster',
    kind: 'required',
    title: 'Provide a tank enclosure',
    detail:
      'A hamster needs a large tank enclosure (≥100×50 cm floor) with deep bedding, a wheel and a hideout.',
    cite: CITE_SMALL_PET,
    defIds: ['hamster-tank'],
  },
  // ── Fish ─────────────────────────────────────────────────────────────────
  {
    id: 'aquarium',
    petType: 'fish',
    kind: 'required',
    title: 'Provide an aquarium',
    detail:
      'Fish need an aquarium on a load-rated stand. Size the tank to your stock and cycle it before adding fish.',
    cite: CITE_FISH,
    defIds: ['aquarium-stand'],
  },
  {
    id: 'load-note',
    petType: 'fish',
    kind: 'info',
    title: 'Mind the tank load (~300 kg)',
    detail:
      'A filled aquarium is heavy — a 1.2 m tank runs about 300 kg. Place the load-rated stand against a wall on solid, level flooring, not on a raised or hollow floor build-up.',
    cite: CITE_FISH,
    defIds: [],
  },
]

/** Count placed items whose `defId` is in `defIds` (level-agnostic — a fitting
 *  helps wherever it's placed). */
function countPlaced(items: FurnitureItem[], defIds: string[]): number {
  if (defIds.length === 0) return 0
  const set = new Set(defIds)
  let n = 0
  for (const it of items) {
    if (it && set.has(it.defId)) n++
  }
  return n
}

/** Total window openings across every storey of the plan. */
export function countPlanWindows(plan: FloorPlan | null | undefined): number {
  if (!plan) return 0
  let n = 0
  for (const level of planLevels(plan)) {
    for (const op of level.openings ?? []) {
      if (op?.kind === 'window') n++
    }
  }
  return n
}

/** Resolve a rule to a status from `have`/`need`. `need <= 0` → `done`
 *  (nothing to satisfy — used for info notes). */
function statusOf(have: number, need: number): PetChecklistStatus {
  if (need <= 0) return 'done'
  if (have >= need) return 'done'
  if (have > 0) return 'partial'
  return 'missing'
}

/**
 * Build the pet-compliance checklist for the declared pet types over the placed
 * items + plan. Pure + tolerant of empty/partial input. An empty `petTypes`
 * yields an empty report (no entries). Rules fire only for declared types, in
 * `PET_TYPES` order then rule-table order.
 */
export function buildPetCompliance(
  petTypes: readonly PetType[],
  items: FurnitureItem[] | null | undefined,
  plan: FloorPlan | null | undefined,
): PetComplianceReport {
  const selected = new Set(petTypes)
  const placed = Array.isArray(items) ? items : []
  const windowCount = countPlanWindows(plan)
  const entries: PetChecklistEntry[] = []

  for (const petType of PET_TYPES) {
    if (!selected.has(petType)) continue
    for (const rule of PET_RULES) {
      if (rule.petType !== petType) continue
      let have: number
      let need: number
      if (rule.windows) {
        // Cat CMF window-mesh: need = every window, have = meshed (capped so a
        // spare mesh can't over-satisfy). A window-less home has nothing to mesh
        // → skip the rule entirely (never a phantom "0 of 0 windows").
        need = windowCount
        if (need === 0) continue
        have = Math.min(countPlaced(placed, rule.defIds), need)
      } else if (rule.kind === 'info') {
        have = 0
        need = 0
      } else {
        need = PET_THRESHOLDS.singleNeed
        have = countPlaced(placed, rule.defIds)
      }
      entries.push({
        id: `${petType}:${rule.id}`,
        petType,
        kind: rule.kind,
        title: rule.title,
        detail: rule.detail,
        cite: rule.cite,
        status: statusOf(have, need),
        have,
        need,
        defIds: rule.defIds,
      })
    }
  }

  let requiredMissing = 0
  let requiredPartial = 0
  let requiredDone = 0
  let recommendedOutstanding = 0
  for (const e of entries) {
    if (e.kind === 'required') {
      if (e.status === 'missing') requiredMissing++
      else if (e.status === 'partial') requiredPartial++
      else requiredDone++
    } else if (e.kind === 'recommended' && e.status !== 'done') {
      recommendedOutstanding++
    }
  }
  return {
    entries,
    requiredMissing,
    requiredPartial,
    requiredDone,
    requiredTotal: requiredMissing + requiredPartial + requiredDone,
    recommendedOutstanding,
  }
}

/** A one-line summary for badges (mirrors hdbCompliance's count exports). */
export function petComplianceSummary(report: PetComplianceReport): {
  requiredMissing: number
  requiredPartial: number
  ok: boolean
} {
  return {
    requiredMissing: report.requiredMissing,
    requiredPartial: report.requiredPartial,
    ok: report.requiredMissing === 0 && report.requiredPartial === 0,
  }
}

/**
 * The catalog def ids that are REQUIRED for at least one of the declared pet
 * types — drives the catalog "Essentials" badge + first-ordering (P6 catalog
 * surfacing). Plan-independent (which defs are essential, not how many are
 * needed), so it's cheap to call on every catalog render. Empty profile →
 * empty set.
 */
export function essentialDefIdsForPetTypes(petTypes: readonly PetType[]): Set<string> {
  const selected = new Set(petTypes)
  const out = new Set<string>()
  for (const rule of PET_RULES) {
    if (rule.kind !== 'required') continue
    if (!selected.has(rule.petType)) continue
    for (const id of rule.defIds) out.add(id)
  }
  return out
}
