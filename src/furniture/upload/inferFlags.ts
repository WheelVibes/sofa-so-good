/**
 * Guess an imported model's collision flags from its filename, so a mixed
 * folder drop (rugs + wall art + floor furniture) gets per-item `mounted`/
 * `noClip` without the user tagging each one. The batch checkboxes in the
 * Upload dialog are OR'd on top of this, and the whole thing is gated by the
 * dialog's default-on "Auto-detect …" toggle. Conservative on purpose — a false
 * positive (e.g. a "floor mirror" tagged mounted) is worse than a miss, so only
 * unambiguous wall/ceiling and flat-covering terms match.
 */

/** Flat floor coverings that should never collide (lie under furniture). */
const NOCLIP_RE = /\b(rug|carpet|doormat|runner)\b|\bmat\b/i

/** Wall- or ceiling-mounted fixtures that skip wall collision. */
const MOUNTED_RE =
  /\b(pendant|sconce|chandelier|range[-_ ]?hood|soundbar|curtains?|blinds?|drapes?|valance|cornice|painting|tapestry|tapestry)\b|\bwall[-_ ]?(art|mount|mounted|clock|shelf|shelves|cabinet|lamp|light|mirror|hanging|panel|hook)\b|\bceiling[-_ ]?(light|lamp|fan)\b/i

export interface CollisionFlags {
  mounted: boolean
  noClip: boolean
}

/** Infer `{ mounted, noClip }` from a model's file/display name. Underscores are
 *  normalised to spaces first since `\b` treats `_` as a word char (so
 *  `door_mat` / `wall_sconce` would otherwise miss). */
export function inferCollisionFlags(name: string): CollisionFlags {
  const base = name
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .replace(/_/g, ' ')
  return { mounted: MOUNTED_RE.test(base), noClip: NOCLIP_RE.test(base) }
}
