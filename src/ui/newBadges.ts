/**
 * Registry-driven "New" feature badges (P27): a small pulsing dot (`.new-dot`)
 * on a toolbar/menu entry for a feature that shipped recently, dismissed the
 * first time the user actually clicks it (persisted per-flag so it never
 * reappears — see `badgesSlice`, `hdb_seen_badges`).
 *
 * `NEW_BADGES` maps a `FeatureFlag` to the `APP_VERSION` it was introduced in.
 * A flag only counts as "recent" while the app is still on that same
 * `major.minor.patch` line and within `RECENCY_WINDOW_BUILDS` builds of it —
 * once the patch/minor bumps (or enough builds pass), the badge quietly stops
 * showing. **Retire an entry by deleting it** once it's no longer worth
 * calling out (there's no need to wait for it to age out on its own).
 */

import type { FeatureFlag } from '../features/featureFlags'
import { useStore } from '../state/store'
import { APP_VERSION, parseVersion, type VersionParts } from '../version'

/** Flag → the `APP_VERSION` it was introduced in. Keep this small: only
 *  entries with a real, verified toolbar/menu entry belong here (a badge on a
 *  flag nobody can see is pointless). */
export const NEW_BADGES: Partial<Record<FeatureFlag, string>> = {
  // "Style quiz" — a real MenuItem in the Tools menu's "Export & document"
  // group (`src/ui/toolbar/menus/ToolsMenu.tsx`). Pro tier, so the badge also
  // exercises "hidden when the target flag is off in Simple mode".
  styleQuiz: '0.9.0.6',
  // Progressive-disclosure hint banners — the most recently introduced flag
  // in the current `0.10.0.x` line (shown in both Simple and Pro).
  infoCallouts: '0.10.0.33',
}

/** How many `build` numbers a badge stays "recent" for, once on the same
 *  `major.minor.patch` line as `current`. */
const RECENCY_WINDOW_BUILDS = 25

/** Same `major.minor.patch` AND `current.build - introduced.build` within
 *  `window`. A minor/patch bump (which resets `build`) always ages a badge
 *  out immediately — a "New" callout shouldn't survive a release boundary. */
export function isRecentlyIntroduced(
  introduced: string,
  current: string = APP_VERSION,
  window: number = RECENCY_WINDOW_BUILDS,
): boolean {
  const a: VersionParts = parseVersion(introduced)
  const b: VersionParts = parseVersion(current)
  if (a.major !== b.major || a.minor !== b.minor || a.patch !== b.patch) return false
  return b.build - a.build <= window
}

export interface UseNewBadgeResult {
  /** Whether to render the `.new-dot`. */
  show: boolean
  /** Mark this flag's badge dismissed (call from the entry's `onClick`). */
  markSeen: () => void
}

/**
 * `show` is true only when: `newBadges` is on, the target `flag` itself is on
 * (so a pro-tier target correctly stays unbadged in Simple mode), the flag has
 * a `NEW_BADGES` entry, that entry is still recent, and the user hasn't
 * dismissed it yet. Gated **inside** the hook (not via an early return before
 * calling it) so a component can call `useNewBadge(flag)` unconditionally,
 * keeping the rules of hooks intact.
 */
export function useNewBadge(flag: FeatureFlag): UseNewBadgeResult {
  const badgesOn = useStore((s) => s.featureFlags.newBadges)
  const targetOn = useStore((s) => s.featureFlags[flag])
  const seen = useStore((s) => s.seenBadges.includes(flag))
  const markBadgeSeen = useStore((s) => s.markBadgeSeen)

  const introduced = NEW_BADGES[flag]
  const show = Boolean(
    badgesOn && targetOn && introduced && isRecentlyIntroduced(introduced) && !seen,
  )

  return {
    show,
    markSeen: () => markBadgeSeen(flag),
  }
}
