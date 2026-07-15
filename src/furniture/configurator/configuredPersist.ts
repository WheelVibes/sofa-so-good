/**
 * Slot configurator — (de)serialise a `ConfiguredSpec` recipe for persistence on
 * a baked product def (`UserGltfDef.slotSpec`, SLOT-204), so a placed configured
 * product re-opens editable in the configurator.
 *
 * Since Asset Studio Stage 3a this rides the SHARED versioned envelope
 * (`furniture/specEnvelope.ts`, kind `'configured'`) — the same
 * parse/serialize/migrate/guard path as the designer's `assetSpec` — instead of
 * a raw unversioned `JSON.stringify(spec)`. A `parseLegacy` recogniser keeps
 * reading the pre-envelope raw `{ productId, selections }` blobs (existing saves
 * never break); the next write re-saves them in the envelope. A malformed /
 * future-version blob yields `null` (the dialog then opens a fresh product).
 *
 * `clampConfig` remains the real defence — this only guards the outer shape so a
 * garbage blob doesn't reach it. Pure + dependency-free → unit-testable.
 */

import { type EnvelopeCodec, parseEnvelope, serializeEnvelope } from '../specEnvelope'
import type { ConfiguredSpec } from './model'

/** Current envelope version for a configured recipe.
 *  - v1 (Stage 3a): `{ productId, selections }` — same shape as the legacy raw
 *    blob, now wrapped in the shared envelope. */
export const CONFIGURED_SPEC_VERSION = 1

/** Migrate a recipe from envelope version `from` up to current; unknown/newer →
 *  null. Pure + exported for tests. */
export function migrateConfiguredSpec(spec: ConfiguredSpec, from: number): ConfiguredSpec | null {
  return from === 1 ? spec : null
}

/** Structural guard — `{ productId: string, selections: Record<string, string |
 *  null> }`. Strict enough to reject garbage; `clampConfig` does the real work. */
function isConfiguredSpec(x: unknown): x is ConfiguredSpec {
  if (!x || typeof x !== 'object') return false
  const s = x as Record<string, unknown>
  if (typeof s.productId !== 'string') return false
  if (!s.selections || typeof s.selections !== 'object' || Array.isArray(s.selections)) return false
  return Object.values(s.selections as Record<string, unknown>).every(
    (v) => v === null || typeof v === 'string',
  )
}

const CONFIGURED_CODEC: EnvelopeCodec<ConfiguredSpec> = {
  kind: 'configured',
  version: CONFIGURED_SPEC_VERSION,
  isValid: isConfiguredSpec,
  migrate: migrateConfiguredSpec,
  // Legacy pre-envelope shape: the raw `ConfiguredSpec` JSON itself.
  parseLegacy: (parsed) =>
    isConfiguredSpec(parsed) ? { v: CONFIGURED_SPEC_VERSION, payload: parsed } : null,
}

/** Serialise a configured recipe to the versioned envelope JSON stored on the def. */
export function serializeConfiguredSpec(spec: ConfiguredSpec): string {
  return serializeEnvelope(CONFIGURED_CODEC, spec)
}

/** Parse a stored `slotSpec` string back to a `ConfiguredSpec`, or `null` when
 *  absent / malformed / an unknown version. Never throws. */
export function parseConfiguredSpec(json: string | undefined | null): ConfiguredSpec | null {
  return parseEnvelope(CONFIGURED_CODEC, json)
}
