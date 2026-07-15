import { describe, expect, it } from 'vitest'
import { type EnvelopeCodec, parseEnvelope, serializeEnvelope } from './specEnvelope'

interface Foo {
  a: number
}

/** A representative codec: current v2, a v1 legacy `{ ver, foo }` shape, identity
 *  migration for v1→v2. */
const fooCodec: EnvelopeCodec<Foo> = {
  kind: 'asset',
  version: 2,
  isValid: (x): x is Foo => !!x && typeof x === 'object' && typeof (x as Foo).a === 'number',
  migrate: (p, from) => (from === 1 || from === 2 ? p : null),
  parseLegacy: (parsed) => {
    const rec = parsed as Record<string, unknown>
    if (rec && typeof rec.ver === 'number' && rec.foo !== undefined) {
      return { v: rec.ver, payload: rec.foo }
    }
    return null
  },
}

describe('specEnvelope', () => {
  it('round-trips a payload through the versioned envelope', () => {
    const json = serializeEnvelope(fooCodec, { a: 3 })
    expect(JSON.parse(json)).toEqual({ kind: 'asset', v: 2, payload: { a: 3 } })
    expect(parseEnvelope(fooCodec, json)).toEqual({ a: 3 })
  })

  it('returns null for absent / empty / malformed JSON (never throws)', () => {
    expect(parseEnvelope(fooCodec, undefined)).toBeNull()
    expect(parseEnvelope(fooCodec, null)).toBeNull()
    expect(parseEnvelope(fooCodec, '')).toBeNull()
    expect(parseEnvelope(fooCodec, '{not json')).toBeNull()
    expect(parseEnvelope(fooCodec, '42')).toBeNull()
  })

  it('rejects a different-kind envelope', () => {
    const other = JSON.stringify({ kind: 'configured', v: 2, payload: { a: 1 } })
    expect(parseEnvelope(fooCodec, other)).toBeNull()
  })

  it('rejects a future / unknown version (migrate returns null)', () => {
    const future = JSON.stringify({ kind: 'asset', v: 3, payload: { a: 1 } })
    expect(parseEnvelope(fooCodec, future)).toBeNull()
  })

  it('rejects a structurally-invalid payload', () => {
    const bad = JSON.stringify({ kind: 'asset', v: 2, payload: { a: 'nope' } })
    expect(parseEnvelope(fooCodec, bad)).toBeNull()
  })

  it('parses a legacy (pre-envelope) blob via the codec recogniser', () => {
    const legacy = JSON.stringify({ ver: 1, foo: { a: 7 } })
    expect(parseEnvelope(fooCodec, legacy)).toEqual({ a: 7 })
  })

  it('rejects a blob the codec does not recognise as legacy', () => {
    expect(parseEnvelope(fooCodec, JSON.stringify({ nonsense: true }))).toBeNull()
  })
})
