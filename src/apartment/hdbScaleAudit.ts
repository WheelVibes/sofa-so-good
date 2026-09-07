/**
 * HDB-SCALE-AUDIT — the shell/fitting dimensions the 2026-09-07 scale audit corrected
 * against published Singapore standards, behind the `hdbScaleAudit` flag.
 *
 * Full table (code value · measured value · cited reference · verdict) in
 * **`docs/audit/hdb-scale-audit-2026-09-07.md`**; the measured column is produced by
 * `scripts/dev-probes/scale-audit.mjs`, which is re-runnable against either flag state.
 *
 * Only PURE DIMENSION corrections live here. Anything the audit judged a product call —
 * the 2.6 m ceiling, the 550 mm window cill the source floor plan explicitly calls out,
 * the 800 mm internal door leaf, the wall thicknesses traced off the plan — is left alone
 * and recorded as such in the table.
 *
 * Why a resolver module and not edited constants: `constants.ts` is a static table
 * evaluated at import time, so a flag read there would freeze at module init and never see
 * a toggle. Each geometry consumer instead resolves its spec through this module at build
 * time (`wallSegments` for the hole in the wall, `Door.tsx` for the leaf, `defaultPlan` for
 * the editable plan), so all three stay in lockstep and both flag states are reachable.
 */
import { isFeatureEnabled } from '../features/featureFlags'
import type { Cutout, DoorSpec } from './types'

/**
 * Household-shelter blast-door opening.
 *
 * SCDF *Technical Requirements for Household Shelters 2023*, cl. 2.5: "The opening
 * dimensions of HS door shall be 700mm (W) x 1900mm (H)."
 * https://www.scdf.gov.sg/home/civil-defence-shelter/acts-and-requirements/technical-requirements-for-household-shelters-2023/chapter-2-architectural-requirements/clause-2.5-hs-door
 *
 * The flat shipped it as a normal internal door (800 x 2100 mm), which reads as an
 * ordinary bedroom doorway with a metal leaf in it rather than the short, narrow,
 * unmistakable blast opening every HDB flat built since 1998 actually has.
 */
export const HS_DOOR_WIDTH_M = 0.7
export const HS_DOOR_HEAD_M = 1.9

/** The door whose opening the SCDF clause governs. */
export const HS_DOOR_ID = 'door-householdShelter'

/**
 * Door lever / handle centre height, m AFFL.
 *
 * BCA *Code on Accessibility in the Built Environment 2025*, cl. 4.4.4: door handles and
 * other operable door hardware are to sit between **900 and 1100 mm** above the finished
 * floor. https://file.go.gov.sg/bca-coa2025.pdf
 *
 * The flat derived the handle as 0.42 x the leaf height — 0.878 m on a 2.1 m leaf, i.e.
 * below the bottom of every published range, and measurably so
 * (`scripts/dev-probes/scale-audit.mjs` read 0.874 and 0.878 m off the rendered levers).
 * 1.0 m is the middle of the BCA band and the usual Singapore ironmongery set-out.
 */
export const DOOR_HANDLE_HEIGHT_M = 1.0

/**
 * Main-door kick-plate height, metres.
 *
 * BCA *Code on Accessibility in the Built Environment 2019*, cl. 4.4.13.1: "Kickplates of at
 * least **250 mm** high … are recommended … to protect the push side of doors from damage
 * caused by wheelchair foot-rests."
 * https://isomer-user-content.by.gov.sg/338/57384a60-c5ce-4c3e-a621-1709f60ce428/accessibilitycode2019.pdf
 * (The clause is absent from the 2025 edition, so 2019 remains the only Singapore-code
 * figure — which is why it is cited here rather than the current edition.)
 *
 * The flat shipped a 200 mm plate.
 */
export const KICK_PLATE_HEIGHT_M = 0.25

/** Is the audit's corrected dimension set active? */
export function hdbScaleAuditOn(): boolean {
  return isFeatureEnabled('hdbScaleAudit')
}

/**
 * Apply the audit's corrections to a door spec. Identity when the flag is off, and
 * identity for every door the audit did not touch — so a caller can pipe every door
 * through it unconditionally.
 */
export function hdbScaledDoor(spec: DoorSpec): DoorSpec {
  if (spec.id !== HS_DOOR_ID || !hdbScaleAuditOn()) return spec
  return { ...spec, width: HS_DOOR_WIDTH_M, head: HS_DOOR_HEAD_M }
}

/**
 * Apply the audit's corrections to a wall cutout — the HOLE, which has to move with the
 * leaf or the blast door stands in a 800 x 2100 mm hole with daylight around it.
 * Matched on `refId`, the cutout's link back to the door it belongs to.
 */
export function hdbScaledCutout(cut: Cutout): Cutout {
  if (cut.refId !== HS_DOOR_ID || !hdbScaleAuditOn()) return cut
  return { ...cut, width: HS_DOOR_WIDTH_M, head: HS_DOOR_HEAD_M }
}
