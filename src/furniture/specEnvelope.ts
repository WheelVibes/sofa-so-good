/**
 * One versioned envelope for persisted design specs (Asset Studio Stage 3a — the
 * recorded Stage-1 review debt: "unify the persisted specs under one versioned
 * envelope").
 *
 * Both authoring surfaces persist a JSON recipe on `UserGltfDef` so a saved
 * asset re-opens editable: the GLB Asset Designer (`glbEdit/specPersist.ts`,
 * kind `'asset'`, field `assetSpec`) and the slot configurator
 * (`configurator/configuredPersist.ts`, kind `'configured'`, field `slotSpec`).
 * They used to be two parallel ad-hoc `{v, …}` / raw-JSON blobs with their own
 * parse/guard code. This module is the SINGLE parse / serialize / migrate /
 * guard path they now share — so a third spec kind (Stage 3 templates /
 * components) folds in here instead of forking a fourth copy.
 *
 * Envelope shape: `{ kind, v, payload }`. Each consumer supplies an
 * {@link EnvelopeCodec}: its `kind`, current `version`, a STRICT payload guard,
 * a version migration (older → current; unknown / future → null, never throws),
 * and a `parseLegacy` recogniser for the pre-envelope blob shape it must keep
 * reading (existing saves must NEVER break). `parseEnvelope` tries the envelope
 * first, then legacy; `serializeEnvelope` always writes the new envelope, so a
 * legacy blob is transparently re-saved in the envelope on the next write.
 *
 * NOTE: the two def FIELDS (`assetSpec` / `slotSpec` strings) stay separate for
 * schema stability — the unification is the envelope FORMAT + this one shared
 * module, not a def-field merge.
 *
 * Pure + dependency-free (no three / React) → unit-testable.
 */

type EnvelopeKind = 'asset' | 'configured' | 'component'

export interface EnvelopeCodec<T> {
  kind: EnvelopeKind
  /** Current envelope version this codec writes. */
  version: number
  /** Strict structural guard for a payload at the CURRENT shape. */
  isValid: (payload: unknown) => payload is T
  /** Migrate a payload from envelope version `from` up to `version`; return
   *  `null` for a version this codec can't safely read (unknown / future). */
  migrate: (payload: T, from: number) => T | null
  /** Recognise a pre-envelope (legacy) blob and return its `{ v, payload }`, or
   *  `null` when `parsed` is not this codec's legacy shape. */
  parseLegacy: (parsed: unknown) => { v: number; payload: unknown } | null
}

interface RawEnvelope {
  kind?: unknown
  v?: unknown
  payload?: unknown
}

/** Serialize a payload to the versioned envelope JSON string. */
export function serializeEnvelope<T>(codec: EnvelopeCodec<T>, payload: T): string {
  return JSON.stringify({ kind: codec.kind, v: codec.version, payload })
}

/**
 * Parse a stored envelope (or a legacy blob) back to a validated, migrated
 * payload, or `null` when absent / malformed / wrong-kind / an unreadable
 * version. NEVER throws — a bad blob just means "not restorable" and the caller
 * falls back to its frozen-mesh path.
 */
export function parseEnvelope<T>(
  codec: EnvelopeCodec<T>,
  json: string | undefined | null,
): T | null {
  if (!json) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const env = parsed as RawEnvelope
  // Envelope shape: { kind, v, payload }. A different kind is a HARD reject so a
  // configured blob can never be misparsed as an asset (or vice-versa).
  if (typeof env.kind === 'string') {
    if (env.kind !== codec.kind) return null
    if (typeof env.v !== 'number' || !codec.isValid(env.payload)) return null
    return codec.migrate(env.payload, env.v)
  }
  // Legacy (pre-envelope) blob — let the codec recognise its own old shape.
  const legacy = codec.parseLegacy(parsed)
  if (!legacy) return null
  const payload = legacy.payload
  if (!codec.isValid(payload)) return null
  return codec.migrate(payload, legacy.v)
}
