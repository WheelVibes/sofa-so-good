// @vitest-environment happy-dom
import { deflateSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { applySerialized } from '../state/schema'
import { loadSharedPlanFromUrl } from '../state/storage/bootstrap'
import { useStore } from '../state/store'
import type { PanoTourStop } from '../ui/panorama/panoTour'
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

  // The 64 MB deflate + base64 build is CPU-heavy and shares the box with 11
  // other worker forks in a full run — the 5 s default timeout is marginal
  // under that load (flaked in full runs while passing standalone).
  it('refuses a decompression bomb instead of inflating it into memory', {
    timeout: 20_000,
  }, () => {
    // ~64 MB of zeros compresses to a tiny code that passes MAX_CODE_LENGTH but
    // would blow past the decompressed cap — the bounded inflate must reject it.
    const bomb = new Uint8Array(64 * 1024 * 1024)
    const compressed = deflateSync(bomb, { level: 6 })
    expect(compressed.length).toBeLessThan(2_000_000) // small enough to pass the code-length guard
    let bin = ''
    for (let i = 0; i < compressed.length; i++) bin += String.fromCharCode(compressed[i])
    const code = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(() => decodePlan(code)).toThrow(PlanShareError)
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

describe('share-link round-trip with panoTourStops (C261)', () => {
  it('encodes panoTourStops and decodes them back', () => {
    useStore.getState().__resetForTest()
    const stops: PanoTourStop[] = [
      { id: 'p1', label: 'Living/Dining', position: [9, 3] },
      { id: 'p2', label: 'Bedroom 1', position: [3, 3], levelId: 'level-2' },
    ]
    useStore.setState({ panoTourStops: stops } as never)
    const code = encodeDesignToCode(useStore.getState())
    const design = decodeCodeToDesign(code)
    expect(design.panoTourStops).toHaveLength(2)
    expect(design.panoTourStops?.[0].id).toBe('p1')
    expect(design.panoTourStops?.[0].position).toEqual([9, 3])
    expect(design.panoTourStops?.[1].levelId).toBe('level-2')
  })

  it('decodes old links without panoTourStops as empty array (backward compat)', () => {
    useStore.getState().__resetForTest()
    // Encode a design that has NO panoTourStops field.
    useStore.setState({ panoTourStops: [] } as never)
    const code = encodeDesignToCode(useStore.getState())
    const design = decodeCodeToDesign(code)
    // Should be undefined OR empty array — applySerialized coerces to [].
    const patch = applySerialized(design, new Set())
    expect(patch.panoTourStops).toEqual([])
  })

  it('applySerialized restores tour stops into the store', () => {
    useStore.getState().__resetForTest()
    const stops: PanoTourStop[] = [{ id: 'q1', label: 'Kitchen', position: [5, 1] }]
    useStore.setState({ panoTourStops: stops } as never)
    const code = encodeDesignToCode(useStore.getState())
    const design = decodeCodeToDesign(code)
    const patch = applySerialized(design, new Set())
    expect(patch.panoTourStops).toEqual(stops)
  })

  it('share-link without stops still produces a valid design (old-link compat)', () => {
    // Directly encode a raw payload without the panoTourStops field to simulate
    // a pre-C261 share link.
    useStore.getState().__resetForTest()
    // Encode an arbitrary valid payload and strip panoTourStops before encoding.
    const code = encodeDesignToCode(useStore.getState())
    const decoded = decodePlan(code) as Record<string, unknown>
    delete decoded.panoTourStops
    const codeWithoutStops = encodePlan(decoded)
    const design = decodeCodeToDesign(codeWithoutStops)
    // panoTourStops absent in old payload → applySerialized fills with [].
    const patch = applySerialized(design, new Set())
    expect(patch.panoTourStops).toEqual([])
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
