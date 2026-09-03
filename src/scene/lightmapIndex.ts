/**
 * Read a baked visibility-map set's `index.json` and resolve geometry keys to map URLs.
 *
 * `python/scripts/blender/bake_material.py` writes one PNG per shell mesh named by
 * `geometry_key()` — a hash of the mesh's **world-space** vertices — plus an `index.json` listing
 * them. Keying by geometry rather than by name is what makes the set loadable at all: the bake
 * runs on an exported GLB where meshes are called `Mesh_116`, an exporter index the live scene has
 * never heard of (`src/scene/lightmapKey.ts`).
 *
 * **The hit rate is the load-bearing diagnostic, so it is counted rather than assumed.** A map
 * that never matches and a correctly-working subtle lighting term look *identical* in a
 * screenshot, and the first end-to-end attempt matched **0 of 385** meshes because the keys were
 * hashed in the wrong coordinate frame (`v0.31.7.16`). That failure was caught in minutes only
 * because the probe treated a zero hit rate as an error. This module keeps that property: it
 * tracks lookups and `describeHitRate()` reports them, so a caller can log or throw instead of
 * silently rendering exactly what it rendered before.
 *
 * **One index for every baked plan, not one per plan — and the reason is worth stating.** There
 * is no plan-preset id in the store: a plan is a data structure the user can edit, so there is
 * nothing stable to name an asset folder after. Geometry keys make that unnecessary. A key hashes
 * *world-space* vertices, so a wall in plan A cannot collide with one in plan B, and a single
 * index can carry every shipped plan's maps with the per-mesh lookup doing the discrimination.
 *
 * **Which changes what zero hits means, so `suspect` takes a parameter.** With a plan-specific
 * set, zero hits is a bug. With one shared index, zero hits is the *normal* state for a plan
 * nobody has baked — a user-edited layout, say — and firing a warning there would cry wolf on
 * exactly the case the design expects to be common. So the caller states whether it believes
 * this scene *should* be covered; the resolver reports facts either way.
 */

/** One baked map. `object` and `area` are provenance for debugging; `key` is the contract.
 *  Not exported: consumers reach it through `LightmapIndex.maps`, and an export nothing imports
 *  fails `npm run deadcode`. */
interface LightmapEntry {
  key: string
  file: string
  /**
   * The plan this map was baked from — the digest of that plan's own key set.
   *
   * **A mesh key alone is not a sufficient identity.** Aperture visibility is a property of a
   * surface *in its surroundings*, while the key hashes only the surface. Measured: baking the
   * 5-Room plan on top of the 4-Room set, **20 of 65 meshes collided** — HDB layouts repeat wall
   * positions on a grid, so the same wall recurs at the same coordinates in different plans while
   * seeing entirely different rooms. Without the context, one plan renders with another's
   * visibility.
   */
  ctx: string
  object?: string
  area?: number
  /**
   * Atlas slots the bake filled with room-facing data, `[col, row]`.
   *
   * The consumer needs this because the two sides derive the slot from different
   * normals — Blender's `poly.normal` in the bake, the app's triangle winding at
   * runtime — and a disagreement flips `row` onto the empty mirror slot.
   * `v0.31.7.98` measured whole surfaces black from exactly that. Optional: an
   * index baked before `v0.31.7.99` has none, and the UV builder then behaves as
   * it always did.
   */
  slots?: [number, number][]
}

export interface LightmapIndex {
  version: number
  /** Which pass was baked — only `visibility` is consumed today. */
  pass: string
  /** The UV layout the maps were baked in. Mismatch here means every lookup is wrong. */
  uv: string
  maps: LightmapEntry[]
  /**
   * Per-plan area-weighted mean visibility, keyed by context.
   *
   * **This is what lets one fitted gain serve every plan.** The gain relates the app's artistic
   * fill to physical visibility and is a calibration constant, not a derivable one
   * (`v0.31.7.27`). But the *ratio* between plans is measurable: the 5-Room plan's mean is
   * **0.355** against the 4-Room's **0.208**, a 1.71× spread, and applying the 4-Room's gain to
   * the 5-Room plan made its spatial match *worse* — 1.53× → 2.25× (`v0.31.7.44`). Scaling the
   * fitted gain by `referenceMean / thisPlanMean` removes that.
   *
   * Optional: a set baked before this existed still loads, and the runtime falls back to the
   * unscaled gain rather than refusing.
   */
  contexts?: Record<string, { mean: number }>
  /**
   * The bake's `--encode` exponent: texels hold `value ** encode`.
   *
   * **Consumed only to REFUSE it.** `bake_material.py` has offered `--encode` since
   * `v0.31.7.x` and records it in the index, and nothing in the runtime has ever read it — so an
   * encoded set would load, look plausible, and be wrong by a power everywhere. That is the same
   * failure class the `uv` check exists to prevent, and it is indistinguishable from a
   * mis-calibrated gain, which is exactly the symptom `v0.31.7.102` spent the round chasing.
   * Applying `pow(v, 1/encode)` is the eventual fix; there is no encoded set to validate it
   * against, so this build rejects instead of guessing.
   */
  encode?: number
}

/** The only index shape this build understands. v1 had no per-map context and could therefore
 *  apply one plan's maps to another; refusing it outright is the point of the bump. */
const SUPPORTED_VERSION = 2
/** Must match `bake_material.py:make_box_uvs` and `src/scene/lightmapUv.ts`. */
const SUPPORTED_UV = 'box-atlas-3x2'

/**
 * Validate a parsed `index.json`.
 *
 * Returns `{ index }` or `{ error }` rather than throwing: a missing or stale lightmap set must
 * degrade to today's render, never break the scene. The **`uv` check is not pedantry** — a set
 * baked in a different layout would load, look plausible, and be wrong everywhere, which is the
 * hardest class of bug to notice.
 */
export function parseLightmapIndex(raw: unknown): { index: LightmapIndex } | { error: string } {
  if (typeof raw !== 'object' || raw === null) return { error: 'index is not an object' }
  const o = raw as Partial<LightmapIndex>
  if (o.version !== SUPPORTED_VERSION) {
    return { error: `unsupported index version ${String(o.version)} (need ${SUPPORTED_VERSION})` }
  }
  if (o.uv !== SUPPORTED_UV) {
    return { error: `unsupported uv layout ${String(o.uv)} (need ${SUPPORTED_UV})` }
  }
  // A non-unit encode is silently misread by every consumer in this build; see `encode` above.
  if (typeof o.encode === 'number' && o.encode !== 1) {
    return { error: `index uses --encode ${o.encode}; this build only reads unencoded maps` }
  }
  if (!Array.isArray(o.maps)) return { error: 'index has no maps array' }
  const maps: LightmapEntry[] = []
  for (const m of o.maps) {
    if (typeof m?.key !== 'string' || typeof m?.file !== 'string') {
      return { error: 'a map entry is missing key or file' }
    }
    if (typeof m?.ctx !== 'string') return { error: `map ${m.key} has no plan context` }
    // `slots` was ADDED TO THE INTERFACE AND NEVER COPIED HERE, so `slotsByCtxKey` below was
    // always empty and `slotsFor` always returned null. The mirror-row relocation in
    // `lightmapUv.ts` therefore never ran, which is why `v0.31.7.99` measured `flipped = 0` and
    // read it as evidence against the row-flip hypothesis rather than as a dead code path.
    const slots = Array.isArray(m.slots)
      ? m.slots.filter(
          (s): s is [number, number] =>
            Array.isArray(s) && s.length === 2 && s.every((n) => typeof n === 'number'),
        )
      : undefined
    maps.push({
      key: m.key,
      file: m.file,
      ctx: m.ctx,
      object: m.object,
      area: m.area,
      ...(slots?.length ? { slots } : {}),
    })
  }
  if (!maps.length) return { error: 'index lists no maps' }
  const contexts =
    o.contexts && typeof o.contexts === 'object'
      ? Object.fromEntries(
          Object.entries(o.contexts)
            .filter(([, v]) => typeof (v as { mean?: unknown })?.mean === 'number')
            .map(([k, v]) => [k, { mean: (v as { mean: number }).mean }]),
        )
      : undefined
  return {
    index: {
      version: o.version,
      pass: String(o.pass ?? 'unknown'),
      uv: o.uv,
      maps,
      contexts,
      ...(typeof o.encode === 'number' ? { encode: o.encode } : {}),
    },
  }
}

/** A resolver over one baked set, counting hits and misses as it goes. */
export interface LightmapResolver {
  /**
   * Which baked plan the given keys belong to, or `null` if none matches.
   *
   * Called with every candidate key **before** any lookup, because a key can exist in more than
   * one plan's maps (20 of 65 did, on real data) and applying the wrong plan's visibility is
   * worse than applying none. The context with the most matches wins; ties and zero matches
   * return `null`, which leaves the render untouched.
   */
  chooseContext(keys: readonly string[]): string | null
  /**
   * URL for a geometry key within `ctx`, or `null`. Counts the lookup.
   *
   * `ctx` is required rather than optional: an unscoped lookup is the bug this parameter exists
   * to prevent, so there is deliberately no convenient way to perform one.
   */
  urlFor(key: string, ctx: string): string | null
  /** The slots that map filled, or `null` when the index predates the field. */
  slotsFor(key: string, ctx: string): [number, number][] | null
  /** `{ looked, hit, missed, rate }` — `rate` is `hit / looked`, or 0 before any lookup. */
  stats(): { looked: number; hit: number; missed: number; rate: number }
  /**
   * A one-line summary, plus `suspect`.
   *
   * `expectCoverage` is the caller's claim that this scene *should* have maps. Pass `true` for a
   * plan known to be baked, where zero hits means a real bug (wrong coordinate frame, stale
   * asset). Pass `false` — the default — for the shared-index case, where an unbaked plan
   * legitimately matches nothing and a warning would be noise.
   */
  describeHitRate(expectCoverage?: boolean): { message: string; suspect: boolean }
}

/**
 * `baseUrl` is where the PNGs live; entries' `file` fields are relative to it.
 *
 * `minLookupsToJudge` exists because a hit rate over two lookups means nothing — the scene mounts
 * progressively, and judging too early would cry wolf on every load.
 */
export function createLightmapResolver(
  index: LightmapIndex,
  baseUrl: string,
  minLookupsToJudge = 20,
): LightmapResolver {
  const byCtxKey = new Map(index.maps.map((m) => [`${m.ctx}/${m.key}`, m.file]))
  const slotsByCtxKey = new Map(
    index.maps
      .filter((m) => Array.isArray(m.slots) && m.slots.length > 0)
      .map((m) => [`${m.ctx}/${m.key}`, m.slots as [number, number][]]),
  )
  const keysByCtx = new Map<string, Set<string>>()
  for (const m of index.maps) {
    const set = keysByCtx.get(m.ctx) ?? new Set<string>()
    set.add(m.key)
    keysByCtx.set(m.ctx, set)
  }
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  let looked = 0
  let hit = 0
  return {
    chooseContext(keys) {
      const wanted = new Set(keys)
      let best: string | null = null
      let bestScore = 0
      let tied = false
      for (const [ctx, ctxKeys] of keysByCtx) {
        let score = 0
        for (const k of ctxKeys) if (wanted.has(k)) score += 1
        if (score > bestScore) {
          bestScore = score
          best = ctx
          tied = false
        } else if (score === bestScore && score > 0) {
          tied = true
        }
      }
      // A tie means the evidence does not distinguish two plans; guessing would apply the wrong
      // visibility half the time, so decline.
      if (tied || bestScore === 0) {
        // Record the evidence examined even when declining. Otherwise `urlFor` is never called,
        // `looked` stays 0, and the hit-rate diagnostic silently loses its denominator — so the
        // one case it exists to report (nothing matched) would report nothing at all.
        looked += keys.length
        return null
      }
      return best
    },
    slotsFor(key, ctx) {
      return slotsByCtxKey.get(`${ctx}/${key}`) ?? null
    },
    urlFor(key, ctx) {
      looked += 1
      const file = byCtxKey.get(`${ctx}/${key}`)
      if (!file) return null
      hit += 1
      return `${base}${file}`
    },
    stats() {
      return { looked, hit, missed: looked - hit, rate: looked ? hit / looked : 0 }
    },
    describeHitRate(expectCoverage = false) {
      const { rate } = this.stats()
      const pct = (100 * rate).toFixed(0)
      const judged = looked >= minLookupsToJudge
      const suspect = expectCoverage && judged && rate === 0
      return {
        message:
          `lightmaps: ${hit}/${looked} meshes matched (${pct} %), ${index.maps.length} maps in set` +
          (suspect
            ? ' — ZERO matched on a plan expected to be covered, so something is wrong (stale' +
              ' asset, or keys hashed in a different coordinate frame)'
            : judged && rate === 0
              ? ' — no maps for this plan (expected for an unbaked or user-edited layout)'
              : ''),
        suspect,
      }
    },
  }
}
