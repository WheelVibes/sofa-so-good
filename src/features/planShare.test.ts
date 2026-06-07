import { describe, expect, it } from 'vitest'
import { applySerialized } from '../state/schema'
import { useStore } from '../state/store'
import {
  decodeCodeToDesign,
  decodePlan,
  encodeDesignToCode,
  encodePlan,
  PlanShareError,
} from './planShare'

describe('encodePlan / decodePlan', () => {
  it('round-trips an arbitrary JSON value through a URL-safe code', () => {
    const value = { a: 1, b: 'héllo ✓', c: [1, 2, { d: true }], n: null }
    const code = encodePlan(value)
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/) // url-safe, no +/=
    expect(decodePlan(code)).toEqual(value)
  })

  it('compresses repetitive data well below the raw JSON size', () => {
    const big = { rooms: Array.from({ length: 200 }, () => ({ name: 'Room', w: 3, d: 3 })) }
    const code = encodePlan(big)
    expect(code.length).toBeLessThan(JSON.stringify(big).length)
  })

  it('throws PlanShareError on empty / corrupt / non-code input', () => {
    expect(() => decodePlan('')).toThrow(PlanShareError)
    expect(() => decodePlan('!!!not base64!!!')).toThrow(PlanShareError)
    expect(() => decodePlan('aGVsbG8')).toThrow(PlanShareError) // valid b64, not deflate
  })
})

describe('encodeDesignToCode / decodeCodeToDesign', () => {
  it('round-trips the live design through a share code', () => {
    useStore.getState().__resetForTest()
    const code = encodeDesignToCode(useStore.getState())
    const design = decodeCodeToDesign(code)
    // The decoded payload is a valid SerializedState that applySerialized accepts.
    const patch = applySerialized(design, new Set())
    expect(Array.isArray(patch.items)).toBe(true)
    expect(patch.floorPlan).toBeDefined()
  })

  it('rejects a corrupt code with a user-facing PlanShareError', () => {
    expect(() => decodeCodeToDesign('garbage')).toThrow(PlanShareError)
  })

  it('rejects a well-formed code whose payload is not a valid plan', () => {
    const code = encodePlan({ not: 'a design' })
    expect(() => decodeCodeToDesign(code)).toThrow(PlanShareError)
  })
})
