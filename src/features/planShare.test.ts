import { describe, expect, it } from 'vitest'
import { applySerialized } from '../state/schema'
import { loadSharedPlanFromUrl } from '../state/storage/bootstrap'
import { useStore } from '../state/store'
import {
  buildPlanShareUrl,
  decodeCodeToDesign,
  decodePlan,
  encodeDesignToCode,
  encodePlan,
  PlanShareError,
  parsePlanRoute,
  planShareHash,
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

describe('plan route helpers', () => {
  it('round-trips a code through the hash route', () => {
    const code = 'aB-_123'
    expect(parsePlanRoute(planShareHash(code))).toBe(code)
    expect(parsePlanRoute('#/plans/xyz')).toBe('xyz')
    expect(parsePlanRoute('#plans/xyz')).toBe('xyz') // tolerant of missing slash
  })
  it('returns null for non-plan hashes', () => {
    expect(parsePlanRoute('')).toBeNull()
    expect(parsePlanRoute('#/other')).toBeNull()
    expect(parsePlanRoute(null)).toBeNull()
  })
  it('builds a full share URL ending in the plan hash', () => {
    expect(buildPlanShareUrl('abc')).toMatch(/#\/plans\/abc$/)
  })
})

describe('loadSharedPlanFromUrl', () => {
  it('loads the shared design from the hash and clears it', async () => {
    useStore.getState().__resetForTest()
    // Make a distinctive custom plan so it serializes + is recognisable.
    useStore.setState({
      floorPlan: { ...useStore.getState().floorPlan, id: 'custom-share', name: 'Shared Plan X' },
    })
    const code = encodeDesignToCode(useStore.getState())

    useStore.getState().__resetForTest()
    expect(useStore.getState().floorPlan.name).not.toBe('Shared Plan X')
    window.location.hash = planShareHash(code)
    await loadSharedPlanFromUrl()

    expect(useStore.getState().floorPlan.name).toBe('Shared Plan X')
    expect(window.location.hash).toBe('') // hash cleared after loading
  })

  it('is a no-op when the hash is not a plan route', async () => {
    useStore.getState().__resetForTest()
    window.location.hash = '#/something-else'
    const before = useStore.getState().floorPlan.name
    await loadSharedPlanFromUrl()
    expect(useStore.getState().floorPlan.name).toBe(before)
    window.location.hash = ''
  })
})
