/**
 * Housing-type-conditional renovation/permit notes (SG1, contractor-handover
 * research + SG-specificity audit 2026-07-18).
 *
 * `plan.category.housingType` drives which approval path applies — HDB flats,
 * condominiums, and landed houses go through structurally different regimes
 * (HDB permit vs MCST/management approval vs BCA-direct), but the demolition
 * plan + drawing-set cover sheet used to render the HDB/PE text unconditionally
 * regardless of the plan's actual housing type. This module is the single
 * source of truth both call sites read from.
 *
 * Pure + unit-tested; a plan with no `category` (older saved plans / templates
 * predating the field) falls back to the HDB text — the app's prior universal
 * default, so behaviour for existing plans is unchanged.
 */

import type { HousingType } from './types'

/** Ordered note lines for the given housing type, headed by a bold title line
 *  (index 0 — callers that bold the first line, e.g. the demolition-plan
 *  legend, keep working unchanged). Kept to 5-6 concise lines, matching the
 *  space budget on the demolition-plan sheet + drawing-set cover. */
export function permitNotes(housingType: HousingType | undefined): string[] {
  switch (housingType) {
    case 'Condominium':
      return [
        'SG renovation notes (Condominium):',
        'Renovation approval from the MCST / building management is required before works begin.',
        'House rules govern hacking, working hours and hoarding — check with management before starting.',
        'Structural alterations additionally require BCA submission with a Professional Engineer (PE).',
        'Wall classification here is user-declared — verify against as-built records before hacking.',
        'Electrical works must be carried out and certified by an EMA-Licensed Electrical Worker (LEW).',
        'Plumbing works connecting to the public network require a PUB Licensed Plumber.',
      ]
    case 'Landed':
      return [
        'SG renovation notes (Landed):',
        'No HDB permit or MCST approval applies — landed houses go direct to BCA for structural works.',
        'Any structural alteration (load-bearing walls, columns, beams, slabs) requires BCA approval with a Professional Engineer (PE).',
        'Wall classification here is user-declared — verify against as-built records before hacking.',
        'Electrical works must be carried out and certified by an EMA-Licensed Electrical Worker (LEW).',
        'Plumbing works connecting to the public network require a PUB Licensed Plumber.',
        'Check with your local authority on working-hours conditions before starting hacking works.',
      ]
    default:
      // 'HDB' and the back-compat "no category" case share the original text.
      return [
        'SG demolition/hacking notes:',
        'A written HDB permit is required before ANY wall demolition (even non-load-bearing).',
        'Load-bearing walls, columns, beams and slabs must NOT be hacked — off-limits by rule.',
        'A Professional Engineer (PE) endorsement is required whenever an RC element is touched.',
        'Wall classification here is user-declared — verify against HDB/BCA as-built records before work.',
        'Electrical works must be carried out and certified by an EMA-Licensed Electrical Worker (LEW).',
        'Plumbing works connecting to the public network require a PUB Licensed Plumber.',
        'Permitted working hours are weekdays only, per the HDB permit conditions.',
      ]
  }
}
