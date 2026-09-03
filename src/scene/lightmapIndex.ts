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
 */

/** One baked map. `object` and `area` are provenance for debugging; `key` is the contract.
 *  Not exported: consumers reach it through `LightmapIndex.maps`, and an export nothing imports
 *  fails `npm run deadcode`. */
interface LightmapEntry {
  key: string
  file: string
  object?: string
  area?: number
}

export interface LightmapIndex {
  version: number
  /** Which pass was baked — only `visibility` is consumed today. */
  pass: string
  /** The UV layout the maps were baked in. Mismatch here means every lookup is wrong. */
  uv: string
  maps: LightmapEntry[]
}

/** The only index shape this build understands. */
const SUPPORTED_VERSION = 1
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
  if (!Array.isArray(o.maps)) return { error: 'index has no maps array' }
  const maps: LightmapEntry[] = []
  for (const m of o.maps) {
    if (typeof m?.key !== 'string' || typeof m?.file !== 'string') {
      return { error: 'a map entry is missing key or file' }
    }
    maps.push({ key: m.key, file: m.file, object: m.object, area: m.area })
  }
  if (!maps.length) return { error: 'index lists no maps' }
  return { index: { version: o.version, pass: String(o.pass ?? 'unknown'), uv: o.uv, maps } }
}

/** A resolver over one baked set, counting hits and misses as it goes. */
export interface LightmapResolver {
  /** URL for a geometry key, or `null` if this set has no map for it. Counts the lookup. */
  urlFor(key: string): string | null
  /** `{ looked, hit, missed, rate }` — `rate` is `hit / looked`, or 0 before any lookup. */
  stats(): { looked: number; hit: number; missed: number; rate: number }
  /**
   * A one-line summary, plus `suspect: true` when the hit rate is low enough to mean the set does
   * not belong to this scene. **Zero hits after a real number of lookups is a bug, not an empty
   * set** — see the module docs.
   */
  describeHitRate(): { message: string; suspect: boolean }
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
  const byKey = new Map(index.maps.map((m) => [m.key, m.file]))
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  let looked = 0
  let hit = 0
  return {
    urlFor(key) {
      looked += 1
      const file = byKey.get(key)
      if (!file) return null
      hit += 1
      return `${base}${file}`
    },
    stats() {
      return { looked, hit, missed: looked - hit, rate: looked ? hit / looked : 0 }
    },
    describeHitRate() {
      const { rate } = this.stats()
      const pct = (100 * rate).toFixed(0)
      const judged = looked >= minLookupsToJudge
      return {
        message:
          `lightmaps: ${hit}/${looked} meshes matched (${pct} %), ${index.maps.length} maps in set` +
          (judged && rate === 0
            ? ' — ZERO matched, so this set does not belong to this scene (wrong plan, or keys' +
              ' hashed in a different coordinate frame)'
            : ''),
        suspect: judged && rate === 0,
      }
    },
  }
}
