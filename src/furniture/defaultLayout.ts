/**
 * Pre-populated layout that approximates a livable HDB 4-room with
 * a queen bed in the master, a single + desk in B2, a double + bookshelf
 * in B3, sofa + TV console + dining table in the L/D, and a kitchen
 * counter with sink. Each per-room module owns its own placements so a
 * later layout author can edit one room without scrolling past the rest.
 */

import { bathrooms } from './defaults/bathrooms'
import { bedroom2 } from './defaults/bedroom2'
import { bedroom3 } from './defaults/bedroom3'
import { applyCurtainFlush } from './defaults/curtainFlush'
import { kitchen } from './defaults/kitchen'
import { livingDining } from './defaults/livingDining'
import { mainBedroom } from './defaults/mainBedroom'
import type { LayoutEntry } from './defaults/types'
import { utility } from './defaults/utility'

/** Returns the assembled default layout as a fresh array. Deterministic
 *  ids guarantee resetToDefault is idempotent — re-applying the layout
 *  doesn't multiply items. */
export function defaultLayout(): LayoutEntry[] {
  // CURTAIN-FLUSH: the four hand-authored curtain entries are re-seated onto
  // their windows' wall centre-lines with a derived, face-relative standoff (and
  // a rod that ducks under the living room's aircon) rather than the drifted
  // hand-typed positions. Flag-gated — off, the tables ship verbatim.
  return applyCurtainFlush([
    ...mainBedroom,
    ...bedroom2,
    ...bedroom3,
    ...livingDining,
    ...kitchen,
    ...bathrooms,
    ...utility,
  ])
}
