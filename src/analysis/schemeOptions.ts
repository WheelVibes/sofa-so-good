/**
 * Alternative scheme generation (G8) — pure data core.
 *
 * `analysis/suggestions.ts` is a rule-based "what to add" wizard: you design,
 * it names missing categories. What an experienced designer actually sells is
 * the opposite direction — they take a brief and a budget, come back with two or
 * three genuinely DIFFERENT schemes, argue the trade-offs, and let you choose.
 *
 * This module does that by composing machinery the app already has rather than
 * inventing a layout engine:
 *  - Furniture comes from `itemsFor`, or by default from
 *    `furniture/furnishPlan.ts:furnishPlanItems(plan, preset, …, seed)`.
 *
 *    **On a CUSTOM plan, two levers are needed and BOTH matter** — measured,
 *    not assumed: a `LayoutPreset` changes the finishes and per-def cosmetic
 *    style props, but no preset defines `kits`, so preset-swapping alone places
 *    the identical furniture in the identical positions (a test comparing two
 *    presets' `defId` sets caught exactly this). Layout variation comes from
 *    the arranger's LAYOUT-REROLL `seed`, which rotates each piece's
 *    edge-candidate list so the same furniture lands against different walls.
 *    Preset = how it reads; seed = where things go.
 *
 *    **On the curated DEFAULT FLAT there is a better source**, and a caller
 *    should pass it via `itemsFor`: `layoutPresets.ts:buildPresetItems` applies
 *    each `layout`-group preset's hand-authored, researched `livingDining`
 *    override, which DOES vary what is placed (`entertainer` brings a
 *    `bar-cart`; `social-lounge` angled armchairs). An earlier revision of this
 *    header claimed no preset varies the furniture — true of the `theme` group
 *    and of the generic kit path, but wrong about the authored layouts.
 *  - `analysis/designScore.ts:buildDesignScore` scores each result on
 *    clearance / furnishing / circulation / daylight / lighting.
 *  - `furniture/furniturePrices.ts:itemPrice` totals each result.
 *
 * **The trade-offs are derived, not written.** For each score category the
 * comparison names which scheme leads and which trails, and by how much. That
 * is a factual difference a user can act on; prose adjectives about "warmth"
 * would be invented. Where the schemes genuinely tie, nothing is claimed.
 *
 * **The theme vocabulary is grounded, and that was checked.** Each surfaced
 * theme's encoded finishes were verified against published interior-design
 * references (including SG HDB/condo sources) — see
 * `docs/research/2026-09-02-scheme-theme-grounding.md` — **all 17 audited**. Warm
 * Industrial's greige wall against a charcoal floor, for instance, is the
 * documented fix for industrial schemes reading cold, not a guess; and the
 * `layout`-group presets are researched by construction, authoring real-world
 * arrangements rather than palettes. One correction came out of it (Modern
 * Luxe's "lacquered" → "satin") and one open content call is recorded in
 * `TODO.md` (Coastal / Tropical Biophilic commit an ACCENT colour to every
 * wall). So a weak comparison is not a theme problem.
 *
 * **Honest limits.** Scheme identity comes from the preset vocabulary, so two
 * schemes differ as much as their presets do — this does not invent a novel
 * arrangement strategy per scheme. And because `designScore` weights clearance
 * and furnishing most heavily, the ranking favours a workable room over a
 * daring one; the full per-category table is returned precisely so a user can
 * overrule the ranking on grounds the score does not measure.
 *
 * Pure (no store, no three, no DOM) → unit-testable directly.
 */

import type { FloorPlan } from '../floorplan/types'
import { furnishPlanItems } from '../furniture/furnishPlan'
import { itemPrice } from '../furniture/furniturePrices'
import type { LayoutPreset } from '../furniture/presets/types'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { buildDesignScore, type DesignScore } from './designScore'
import { buildLayoutCritique, type LayoutCritique } from './layoutCritique'

/** One generated scheme, scored and priced. */
export interface SchemeCandidate {
  presetId: string
  /** The arrangement seed this scheme was laid out with. */
  layoutSeed: number
  name: string
  description: string
  items: FurnitureItem[]
  score: DesignScore
  /** Total of every placed item's price (dollars). */
  totalPrice: number
  itemCount: number
  /**
   * Layout-quality critique (`layoutCritique.ts`) — the spatial-relationship
   * dimension `designScore` does not measure. Kept SEPARATE from `score`
   * rather than folded into it: re-weighting a shipped user-visible score is a
   * product decision, adding a measurement beside it is not.
   */
  critique: LayoutCritique
  /** Present only when a budget was supplied. */
  budget?: { limit: number; overBy: number; pass: boolean }
}

export interface SchemeComparison {
  /** Ranked best-first by overall score, then by price ascending on a tie. */
  candidates: SchemeCandidate[]
  /**
   * Derived, per-category trade-off statements — the substance a user chooses
   * on. Empty when the schemes do not meaningfully differ.
   */
  tradeoffs: string[]
  /** Why the leading scheme leads, in one line. Empty for a single candidate. */
  recommendation: string
  /** Presets that produced nothing placeable, so a caller can say so. */
  emptyPresetIds: string[]
}

/** A score gap below this is a tie, not a trade-off worth printing. */
export const TRADEOFF_MIN_GAP = 5

export interface SchemeOptionsInput {
  plan: FloorPlan
  defs: Record<string, FurnitureDef>
  /**
   * The schemes to generate. Each pairs a preset (finishes + cosmetic style)
   * with a layout seed (arrangement). Distinct seeds are what make two schemes
   * different LAYOUTS rather than restyled copies of one — see the module
   * header.
   */
  presets: LayoutPreset[]
  /**
   * Resolve a preset's furniture. Defaults to `furnishPlanItems` + the layout
   * seed — the generic kit path, correct for a custom or template plan.
   *
   * The CURATED DEFAULT FLAT has a better source: `layoutPresets.ts:
   * buildPresetItems` applies each `layout`-group preset's hand-authored
   * `livingDining`/`rooms` overrides, described in `presets/types.ts` as "a
   * researched real-world layout". Those genuinely differ in WHAT is placed —
   * measured: `entertainer` contributes a `bar-cart` no other preset has,
   * `social-lounge` its angled armchairs — which the generic kit path cannot
   * do, since no preset defines `kits`. A caller on the default flat should
   * pass that resolver so the schemes use the researched layouts instead of a
   * generic reseed.
   */
  itemsFor?: (preset: LayoutPreset, index: number) => FurnitureItem[]
  /**
   * Layout seed per preset, by index. A missing entry falls back to the
   * preset's index, so callers get varied layouts by default instead of the
   * same arrangement three times. Pass all-zeros to compare pure styling.
   */
  seeds?: number[]
  doors?: Record<string, { open: boolean }>
  /** Budget in dollars; when set, each scheme reports against it. */
  budget?: number | null
}

function totalPrice(items: FurnitureItem[], defs: Record<string, FurnitureDef>): number {
  let sum = 0
  for (const it of items) {
    const def = defs[it.defId]
    if (!def) continue
    // Mirrors `ui/report.ts`'s pricing call exactly, so a scheme's total and
    // the report's budget can never disagree about the same item.
    const variant = typeof it.props?.variant === 'string' ? it.props.variant : undefined
    sum += itemPrice(def, def.category, variant, it.meta?.price)
  }
  return Math.round(sum)
}

/**
 * Generate, score and compare alternative schemes for a plan.
 *
 * A preset that furnishes nothing (its kits do not cover this plan's room
 * categories) is reported in `emptyPresetIds` rather than ranked as a
 * zero-score scheme — an empty home is not a design option.
 */
export function buildSchemeOptions(input: SchemeOptionsInput): SchemeComparison {
  const { plan, defs, presets, doors = {}, budget = null } = input
  const candidates: SchemeCandidate[] = []
  const emptyPresetIds: string[] = []

  for (const [i, preset] of presets.entries()) {
    const seed = input.seeds?.[i] ?? i
    const items = input.itemsFor
      ? input.itemsFor(preset, i)
      : furnishPlanItems(plan, preset, defs, doors, true, seed)
    if (items.length === 0) {
      emptyPresetIds.push(preset.id)
      continue
    }
    const price = totalPrice(items, defs)
    candidates.push({
      presetId: preset.id,
      layoutSeed: seed,
      name: preset.name,
      description: preset.description,
      items,
      score: buildDesignScore(items, defs, plan, { doors }),
      critique: buildLayoutCritique(plan, items, defs),
      totalPrice: price,
      itemCount: items.length,
      ...(typeof budget === 'number' && Number.isFinite(budget) && budget > 0
        ? {
            budget: {
              limit: budget,
              overBy: Math.max(0, price - budget),
              pass: price <= budget,
            },
          }
        : {}),
    })
  }

  // Best overall wins; a cheaper scheme wins a score tie, since at equal
  // quality the cheaper design is the better recommendation.
  // Best overall wins. On a designScore TIE the layout critique breaks it —
  // measured: three authored arrangements tie at 83 on designScore while the
  // critique separates them 64-78, so without this the ranking fell through to
  // price and never considered layout quality at all. Price remains the last
  // resort, then preset id for determinism.
  candidates.sort(
    (a, b) =>
      b.score.overall - a.score.overall ||
      b.critique.score - a.critique.score ||
      a.totalPrice - b.totalPrice ||
      a.presetId.localeCompare(b.presetId),
  )

  return {
    candidates,
    tradeoffs: deriveTradeoffs(candidates, budget),
    recommendation: deriveRecommendation(candidates),
    emptyPresetIds,
  }
}

/**
 * One statement per score category where the schemes genuinely differ, plus a
 * price statement. Categories within {@link TRADEOFF_MIN_GAP} are skipped —
 * printing a 1-point "difference" would dress noise up as a decision.
 */
function deriveTradeoffs(candidates: SchemeCandidate[], budget: number | null): string[] {
  if (candidates.length < 2) return []
  const out: string[] = []
  const categoryIds = candidates[0]!.score.categories.map((c) => c.id)

  for (const id of categoryIds) {
    const scored = candidates
      .map((c) => ({
        name: c.name,
        score: c.score.categories.find((k) => k.id === id)?.score ?? 0,
        label: c.score.categories.find((k) => k.id === id)?.label ?? id,
      }))
      .sort((a, b) => b.score - a.score)
    const best = scored[0]!
    const worst = scored[scored.length - 1]!
    const gap = best.score - worst.score
    if (gap < TRADEOFF_MIN_GAP) continue
    out.push(
      `${best.label}: ${best.name} leads at ${best.score}, ${worst.name} trails at ${worst.score} (${gap} apart).`,
    )
  }

  // Layout critique, when the schemes genuinely differ on it.
  const byCritique = [...candidates].sort((a, b) => b.critique.score - a.critique.score)
  const cBest = byCritique[0]!
  const cWorst = byCritique[byCritique.length - 1]!
  if (cBest.critique.score - cWorst.critique.score >= TRADEOFF_MIN_GAP) {
    out.push(
      `Layout quality: ${cBest.name} leads at ${cBest.critique.score}, ${cWorst.name} trails at ${cWorst.critique.score} — measured against published spacing standards (TV distance, conversation range, table reach, sofa proportion).`,
    )
  }

  const byPrice = [...candidates].sort((a, b) => a.totalPrice - b.totalPrice)
  const cheapest = byPrice[0]!
  const dearest = byPrice[byPrice.length - 1]!
  if (dearest.totalPrice > cheapest.totalPrice) {
    out.push(
      `Cost: ${cheapest.name} at $${cheapest.totalPrice.toLocaleString()} vs ${dearest.name} at $${dearest.totalPrice.toLocaleString()} — a $${(dearest.totalPrice - cheapest.totalPrice).toLocaleString()} spread across ${cheapest.itemCount} and ${dearest.itemCount} items.`,
    )
  }

  if (typeof budget === 'number' && budget > 0) {
    const over = candidates.filter((c) => c.budget && !c.budget.pass)
    if (over.length === candidates.length) {
      out.push(
        `Every scheme exceeds the $${budget.toLocaleString()} budget — raise it or cut scope.`,
      )
    } else if (over.length > 0) {
      out.push(
        `Over budget: ${over.map((c) => `${c.name} by $${c.budget!.overBy.toLocaleString()}`).join(', ')}.`,
      )
    }
  }
  return out
}

/** Why the leader leads — its strongest category relative to the runner-up. */
function deriveRecommendation(candidates: SchemeCandidate[]): string {
  if (candidates.length < 2) return ''
  const [top, second] = candidates as [SchemeCandidate, SchemeCandidate]
  if (top.score.overall === second.score.overall) {
    // designScore cannot separate them, so say what actually decided it.
    if (top.critique.score !== second.critique.score) {
      return `${top.name} and ${second.name} both score ${top.score.overall}; ${top.name} is recommended on layout quality (${top.critique.score} vs ${second.critique.score} against published spacing standards).`
    }
    return `${top.name} and ${second.name} score level at ${top.score.overall}; ${top.name} is recommended as the cheaper of the two at $${top.totalPrice.toLocaleString()}.`
  }
  // Name the category the leader wins by most — the honest reason it leads.
  let bestId = ''
  let bestGap = Number.NEGATIVE_INFINITY
  let bestLabel = ''
  for (const cat of top.score.categories) {
    const other = second.score.categories.find((k) => k.id === cat.id)?.score ?? 0
    const gap = cat.score - other
    if (gap > bestGap) {
      bestGap = gap
      bestId = cat.id
      bestLabel = cat.label
    }
  }
  const reason =
    bestId && bestGap > 0 ? ` — mainly on ${bestLabel.toLowerCase()} (${bestGap} points clear)` : ''
  return `${top.name} scores ${top.score.overall} vs ${second.name} at ${second.score.overall}${reason}.`
}
