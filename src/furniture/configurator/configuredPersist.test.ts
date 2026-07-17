import { describe, expect, it } from 'vitest'
import {
  CONFIGURED_SPEC_VERSION,
  migrateConfiguredSpec,
  parseConfiguredSpec,
  serializeConfiguredSpec,
} from './configuredPersist'
import type { ConfiguredSpec } from './model'

const sample: ConfiguredSpec = {
  productId: 'mattress-on-frame',
  selections: { frame: 'oak', mattress: 'foam-20', headboard: null },
}

describe('configuredPersist', () => {
  it('round-trips a configured recipe through the envelope', () => {
    const json = serializeConfiguredSpec(sample)
    expect(JSON.parse(json)).toMatchObject({ kind: 'configured', v: CONFIGURED_SPEC_VERSION })
    expect(parseConfiguredSpec(json)).toEqual(sample)
  })

  it('parses a legacy raw `{ productId, selections }` blob (pre-envelope save)', () => {
    // The old `slotSpec` was a raw `JSON.stringify(clamped)` with no envelope.
    const legacy = JSON.stringify(sample)
    expect(parseConfiguredSpec(legacy)).toEqual(sample)
  })

  it('returns null for garbage / malformed input (never throws)', () => {
    expect(parseConfiguredSpec(undefined)).toBeNull()
    expect(parseConfiguredSpec('')).toBeNull()
    expect(parseConfiguredSpec('{not json')).toBeNull()
    // Missing productId.
    expect(parseConfiguredSpec(JSON.stringify({ selections: {} }))).toBeNull()
    // selections holding a non-string/non-null value.
    expect(parseConfiguredSpec(JSON.stringify({ productId: 'p', selections: { s: 3 } }))).toBeNull()
  })

  it('rejects a future version', () => {
    const future = JSON.stringify({ kind: 'configured', v: 99, payload: sample })
    expect(parseConfiguredSpec(future)).toBeNull()
  })

  it('rejects a wrong-kind envelope (an asset blob is not a configured recipe)', () => {
    const asset = JSON.stringify({ kind: 'asset', v: 1, payload: sample })
    expect(parseConfiguredSpec(asset)).toBeNull()
  })

  it('migrateConfiguredSpec: v1 identity, unknown → null', () => {
    expect(migrateConfiguredSpec(sample, 1)).toBe(sample)
    expect(migrateConfiguredSpec(sample, 2)).toBeNull()
  })
})
