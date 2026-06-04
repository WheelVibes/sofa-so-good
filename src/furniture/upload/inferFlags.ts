/** Per-file collision-flag heuristics for bulk model imports.
 *
 * A folder drop can hold hundreds of models; asking the user to tag each as
 * wall-mounted / floor-clipping is impractical, and a single batch choice is
 * wrong for mixed folders. Infer the flags from the filename so a dropped
 * `ceiling_lamp.glb`, `area_rug.glb`, and `sofa.glb` each get sensible
 * collision behaviour. Conservative by design: only clear wall/ceiling/rug
 * words match, so ambiguous names (tv, mirror, frame) stay floor items the
 * user can adjust in the inspector. */

/** Rugs/mats lie flat on the floor — other furniture slides over them. */
const NOCLIP_RE = /\b(rug|mat|carpet|runner|doormat|floor[-_ ]?mat|prayer[-_ ]?mat|tatami)\b/i

/** Items that hang on a wall or ceiling and shouldn't be wall-collision-checked. */
const MOUNTED_RE =
  /\b(pendant|chandelier|ceiling[-_ ]?(?:lamp|light|fan)?|sconce|wall[-_ ]?(?:lamp|light|art|clock|shelf|shelves|cabinet|unit|mount(?:ed)?|panel)|cornice|crown[-_ ]?moulding|range[-_ ]?hood|cooker[-_ ]?hood|extractor[-_ ]?hood|air[-_ ]?con(?:ditioner)?|aircon|split[-_ ]?unit|downlight|spotlight|track[-_ ]?light)\b/i

export interface CollisionFlags {
  mounted: boolean
  noClip: boolean
}

/** Best-effort collision flags from a model filename (extension-agnostic). */
export function inferCollisionFlags(filename: string): CollisionFlags {
  // Match on the base name only, so a parent folder named "wall art" doesn't
  // dominate the decision for `wall art/sofa.glb`.
  const raw = filename.split(/[/\\]/).pop() ?? filename
  // Normalise separators (`_`, `-`, `.`) to spaces so word boundaries fire —
  // `\b` treats `_` as a word char, so `area_rug` wouldn't match `\brug\b`.
  const base = raw.replace(/[._-]+/g, ' ')
  const noClip = NOCLIP_RE.test(base)
  // A rug is never also "mounted".
  const mounted = !noClip && MOUNTED_RE.test(base)
  return { mounted, noClip }
}
