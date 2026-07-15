/**
 * GLB Asset Designer — (de)serialise an `AssetEditSpec` for persistence in a
 * saved user def, so a designer-built asset re-opens editable (its full part
 * list restored) instead of only as a frozen source mesh.
 *
 * The spec is embedded as a JSON string on the saved def (`UserGltfDef.assetSpec`,
 * mirroring the configurator's `slotSpec` round-trip / SLOT-204) and travels the
 * same IDB-meta + save-schema path as `slotSpec`. It is versioned (`{ v: 1, spec }`)
 * so a future spec-shape change can migrate on read; an absent or unrecognised
 * blob simply yields `null` (today's behaviour: the def re-opens as a source mesh,
 * not an editable part list). Pure + dependency-free → unit-testable.
 */

import type { AssetEditSpec } from './editSpec'

/** Current envelope version. Bump + branch in `parseAssetSpec` on a breaking
 *  spec-shape change. */
export const ASSET_SPEC_VERSION = 1

interface AssetSpecEnvelope {
  v: number
  spec: AssetEditSpec
}

/** Serialise a spec to the versioned JSON string stored on the def. */
export function serializeAssetSpec(spec: AssetEditSpec): string {
  const env: AssetSpecEnvelope = { v: ASSET_SPEC_VERSION, spec }
  return JSON.stringify(env)
}

/** Minimal structural guard — enough to reject garbage without re-validating the
 *  whole geometry (the designer tolerates partial specs via its own defaults). */
function isSpec(x: unknown): x is AssetEditSpec {
  if (!x || typeof x !== 'object') return false
  const s = x as Record<string, unknown>
  return (
    Array.isArray(s.parts) &&
    typeof s.sourceScale === 'number' &&
    !!s.meshOverrides &&
    typeof s.meshOverrides === 'object'
  )
}

/**
 * Parse a stored `assetSpec` string back to an `AssetEditSpec`, or `null` when
 * absent / malformed / an unknown version. Never throws — a bad blob just means
 * "not restorable", falling back to the frozen-source path.
 */
export function parseAssetSpec(json: string | undefined | null): AssetEditSpec | null {
  if (!json) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const env = parsed as Partial<AssetSpecEnvelope>
  if (env.v !== ASSET_SPEC_VERSION) return null
  return isSpec(env.spec) ? env.spec : null
}
