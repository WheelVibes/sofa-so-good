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
  /**
   * This map's own divisor, taking precedence over the index-level `scale`.
   *
   * Per-map normalisation is only safe because this travels WITH the map and is re-applied per
   * material — the between-mesh ratios are reconstructed exactly. `v0.31.7.104` argued the
   * opposite and was wrong; what breaks ratios is one factor applied to maps normalised
   * differently, which is precisely what this field prevents.
   */
  scale?: number
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
   * **CONSUMED since LIGHTMAP-ENCODE-DECODE.** `bake_material.py` has offered `--encode` since
   * `v0.31.7.x`; nothing in the runtime read it until now, so an encoded set loaded, looked
   * plausible, and was wrong by a power everywhere — indistinguishable from a mis-calibrated
   * gain, the symptom `v0.31.7.102` spent a round chasing.
   *
   * **Why an encode is needed at all.** `--per-map-scale` normalises each atlas slot to ITS OWN
   * peak, and one slot can span a 14–125× dynamic range — a texel near the peak and most of the
   * slot far below it. An 8-bit PNG then spends nearly all 256 codes on the bright end. Measured
   * on the shipped set: **5 of the 12 largest maps land their MEDIAN written texel on ≤ 2 of 255
   * levels** (a kitchen wall at 0.2 levels, another at 0.4) — banding coarse enough to read as
   * salt-and-pepper "static" rather than a gradient, visible on the kitchen walls under
   * `?aoDebug=1`. Storing `pow(v, 0.5)` before quantising and decoding `pow(t, 1/0.5) = pow(t,
   * 2.0)` at read time multiplies the level count available to a dark texel by roughly **11×**
   * at the same file size.
   *
   * **A higher bit depth cannot substitute for this.** `TextureLoader`/`HTMLImageElement` decode
   * ANY PNG bit depth — 8 or 16 — to an 8-bit `Uint8ClampedArray` before the pixels reach WebGL,
   * so a 16-bit source still quantises to 256 levels at upload time. Only a non-linear ENCODE
   * changes how those 256 levels are spent; storage precision does not.
   *
   * **Accepted for any exponent in `(0, 1]`, refused outside it.** `1` is the identity (no
   * encode — today's shipped set, and the runtime's off state). Anything in `(0, 1)` compresses
   * the dark end for later expansion. `<= 0`, non-finite, or `> 1` is refused: a non-finite or
   * non-positive exponent makes `1/encode` divide by zero or NaN, and an exponent `> 1` would
   * DARKEN the dark end further — the opposite of what an encode is for — with no such set to
   * validate that shape against. The runtime applies `pow(v, 1/encode)` per texel
   * (`visibilityLightmap.ts`'s `visDecode` uniform); see that module for the shader side.
   */
  encode?: number
  /**
   * Divisor the bake applied before saving; texels hold `irradiance / scale`.
   *
   * **This is a unit conversion, not a look knob, so it is read from the artefact and is not
   * overridable.** PNG is an integer format and Blender clips a float buffer at 1.0 on save,
   * while sky-lit interior irradiance runs far above that — `v0.31.7.104` measured 20 of 24 maps
   * in the v99 set clipping, with a whole-map **mean of 9.4** against the 1.0 ceiling. The saved
   * map was very nearly a binary `>= 1.0` mask, which is why no consumer-side gain could ever
   * fit it and why the fitted `~14` looked arbitrary: it was reconstructing the lost scale.
   *
   * Absent on a `visibility` set, whose values are dimensionless and already in `0..1`.
   */
  scale?: number
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
  // Accept any encode in (0, 1] -- the runtime decodes with `pow(v, 1/encode)`
  // (LIGHTMAP-ENCODE-DECODE, `visibilityLightmap.ts`'s `visDecode` uniform); see `encode` above.
  // Refuse everything else: <= 0 or non-finite would divide by zero/NaN in `1/encode`, and > 1
  // would darken the dark end further -- the opposite of what an encode is for.
  if (
    o.encode !== undefined &&
    (typeof o.encode !== 'number' || !Number.isFinite(o.encode) || !(o.encode > 0) || o.encode > 1)
  ) {
    return { error: `index has an unusable --encode ${String(o.encode)} (need 0 < encode <= 1)` }
  }
  // A scale of 0, NaN or a negative would silently blank or invert every surface. Refusing beats
  // falling back to 1, which would misread the map by whatever the real factor was.
  if (
    o.scale !== undefined &&
    (typeof o.scale !== 'number' || !(o.scale > 0) || !Number.isFinite(o.scale))
  ) {
    return { error: `index has an unusable scale ${String(o.scale)}` }
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
    // Same validation as the index-level scale: 0, negative, NaN and Infinity are refused
    // rather than silently treated as 1, which would misread the map by the real factor.
    if (
      m.scale !== undefined &&
      (typeof m.scale !== 'number' || !(m.scale > 0) || !Number.isFinite(m.scale))
    ) {
      return { error: `map ${m.key} has an unusable scale ${String(m.scale)}` }
    }
    maps.push({
      key: m.key,
      file: m.file,
      ctx: m.ctx,
      object: m.object,
      area: m.area,
      ...(typeof m.scale === 'number' ? { scale: m.scale } : {}),
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
      ...(typeof o.scale === 'number' ? { scale: o.scale } : {}),
    },
  }
}

/**
 * Fetch + validate `<base>/index.json`, collapsing every failure mode to `null` — a missing or
 * unreachable set degrades to today's render, exactly like a genuinely malformed one
 * (`parseLightmapIndex`'s `{error}` case, which the caller still gets back to log).
 *
 * AO-DIR-FALLBACK (`docs/interaction-sweep.md`): `VisibilityLightmaps.tsx`'s `?aoDir=<name>`
 * probe seam points `base` at an arbitrary, DEV-only, regex-checked directory name — one that
 * may not exist. Extracted out of that component so this exact failure shape is unit-testable
 * without a Canvas/`@react-three/fiber` render tree: a dev server's SPA fallback serves
 * `index.html` (200, `text/html`) for an unmatched static path, so `res.ok` is true and
 * `res.json()` REJECTS on the HTML body — and a production static host serving a genuine 404
 * takes the `!res.ok` branch instead. Both, and a hard network failure, must resolve to `null`,
 * never throw or leave a rejected promise unhandled — the caller's effect has no `.catch` at the
 * call site by design, so a throw here WOULD escape it.
 */
export async function fetchLightmapIndex(
  base: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ index: LightmapIndex } | { error: string } | null> {
  try {
    // `no-cache`: see the caller's doc comment on why `public/` assets need this.
    const res = await fetchImpl(`${base}/index.json`, { cache: 'no-cache' })
    if (!res.ok) return null
    const raw = await res.json()
    return parseLightmapIndex(raw)
  } catch {
    // Offline, a network error, or `res.json()` rejecting on a non-JSON body (the SPA-fallback
    // case above) — today's render is the correct fallback, not a stuck loading state.
    return null
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
  /** That map's own divisor, or `null` to fall back to the index-level `scale`. */
  scaleFor(key: string, ctx: string): number | null
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
  const scaleByCtxKey = new Map(
    index.maps
      .filter((m) => typeof m.scale === 'number')
      .map((m) => [`${m.ctx}/${m.key}`, m.scale as number]),
  )
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
    scaleFor(key, ctx) {
      return scaleByCtxKey.get(`${ctx}/${key}`) ?? null
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
          // "key lookups", NOT "meshes". `looked` counts calls to `urlFor`, and
          // `applyLightmapsFromIndex` calls it TWICE per keyed mesh — once in the shared-material
          // pre-pass, once in the apply loop — so this figure is exactly 2x the mesh count. The
          // RATIO is unaffected (both halves double), which is why the mislabel survived: the
          // percentage was always right. The absolute numbers were not, and they were read as
          // meshes twice — the graphics arc recorded "108/385 meshes" as coverage in
          // `v0.31.7.184`, and `v0.31.7.225` spent a round reconciling 28 % against a census that
          // counted 1072 visible meshes. The `applied to N/M candidates` half of this line, which
          // `VisibilityLightmaps` appends, is the mesh-level number.
          `lightmaps: ${hit}/${looked} key lookups matched (${pct} %), ${index.maps.length} maps in set` +
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
