/**
 * Text→plan GENERATION (marquee L): pure request-builder invariants, the
 * response→plan conversion (walls / openings / named rooms + degenerate inputs),
 * and the non-network guard paths of `generateFloorPlan` (empty brief, missing
 * key, insecure endpoint). NEVER hits the network — the happy path is exercised
 * headlessly via the `__applyAiGeneratedPlan` dev hook.
 */
import { describe, expect, it } from 'vitest'
import { AiPlanError, parseGeneratedPlan } from './floorPlanAi'
import { buildGeneratePlanRequest, generateFloorPlan } from './floorPlanGenerate'

describe('buildGeneratePlanRequest', () => {
  it('is an OpenAI-compatible chat payload carrying the brief + a JSON-shape system prompt', () => {
    const req = buildGeneratePlanRequest('a 4-room HDB, ~90 sqm', 'gpt-4o-mini')
    expect(req.model).toBe('gpt-4o-mini')
    expect(req.max_tokens).toBeGreaterThan(0)
    expect(req.messages).toHaveLength(2)
    expect(req.messages[0]?.role).toBe('system')
    expect(req.messages[1]?.role).toBe('user')
    // The brief must reach the model verbatim.
    expect(req.messages[1]?.content).toContain('a 4-room HDB, ~90 sqm')
    // The system prompt pins the response schema keys + the metric frame.
    const system = String(req.messages[0]?.content)
    expect(system).toContain('"walls"')
    expect(system).toContain('"openings"')
    expect(system).toContain('"rooms"')
    expect(system.toLowerCase()).toContain('metres')
    // No image payload — this is the text-only sibling of vision recognition.
    expect(JSON.stringify(req)).not.toContain('image_url')
  })

  it('is pure — identical brief → identical request', () => {
    const a = buildGeneratePlanRequest('brief', 'm')
    const b = buildGeneratePlanRequest('brief', 'm')
    expect(a).toEqual(b)
  })
})

describe('parseGeneratedPlan', () => {
  it('extracts walls, openings, and named rooms from a well-formed reply', () => {
    const text = JSON.stringify({
      walls: [
        { x1: 0, z1: 0, x2: 4, z2: 0, external: true },
        { x1: 4, z1: 0, x2: 4, z2: 3, external: false },
      ],
      openings: [{ kind: 'door', x: 2, z: 0, width: 0.9 }],
      rooms: [{ name: 'Living', x: 0, z: 0, width: 4, depth: 3 }],
    })
    const r = parseGeneratedPlan(text)
    expect(r.walls).toHaveLength(2)
    expect(r.walls[0]?.external).toBe(true)
    expect(r.walls[1]?.external).toBe(false)
    expect(r.openings).toEqual([{ kind: 'door', x: 2, z: 0, width: 0.9 }])
    expect(r.rooms).toEqual([{ name: 'Living', x: 0, z: 0, width: 4, depth: 3 }])
  })

  it('tolerates code fences / prose around the JSON', () => {
    const text =
      'Here is your plan:\n```json\n{"walls":[{"x1":0,"z1":0,"x2":3,"z2":0}],"rooms":[]}\n```\nEnjoy!'
    const r = parseGeneratedPlan(text)
    expect(r.walls).toHaveLength(1)
    expect(r.rooms).toEqual([])
  })

  it('accepts the alternate room shape {origin,w,d} and defaults a missing name', () => {
    const text = JSON.stringify({
      walls: [{ x1: 0, z1: 0, x2: 3, z2: 0 }],
      rooms: [{ origin: [1, 2], w: 3, d: 2.5 }],
    })
    const r = parseGeneratedPlan(text)
    expect(r.rooms).toEqual([{ name: 'Room', x: 1, z: 2, width: 3, depth: 2.5 }])
  })

  it('drops degenerate walls (zero-length) and degenerate rooms (out-of-range sides)', () => {
    const text = JSON.stringify({
      walls: [
        { x1: 0, z1: 0, x2: 0, z2: 0 }, // zero-length → dropped
        { x1: 0, z1: 0, x2: 4, z2: 0 }, // kept
      ],
      rooms: [
        { name: 'Tiny', x: 0, z: 0, width: 0.2, depth: 3 }, // side < 0.5 m → dropped
        { name: 'Huge', x: 0, z: 0, width: 3, depth: 99 }, // side > 40 m → dropped
        { name: 'Bad', x: 0, z: 0, width: Number.NaN, depth: 3 }, // NaN → dropped
        { name: 'Ok', x: 0, z: 0, width: 4, depth: 3 }, // kept
      ],
    })
    const r = parseGeneratedPlan(text)
    expect(r.walls).toHaveLength(1)
    expect(r.rooms).toEqual([{ name: 'Ok', x: 0, z: 0, width: 4, depth: 3 }])
  })

  it('degrades to empty (never throws) on garbage / missing fields', () => {
    expect(parseGeneratedPlan('not json at all')).toEqual({ walls: [], openings: [], rooms: [] })
    expect(parseGeneratedPlan('{}')).toEqual({ walls: [], openings: [], rooms: [] })
    // An open loop (walls that don't close) is still a valid set of segments —
    // the conversion keeps them; the user closes the loop in the editor.
    const open = parseGeneratedPlan(
      '{"walls":[{"x1":0,"z1":0,"x2":4,"z2":0},{"x1":4,"z1":0,"x2":4,"z2":3}]}',
    )
    expect(open.walls).toHaveLength(2)
    expect(open.rooms).toEqual([])
  })
})

describe('generateFloorPlan guard paths (no network)', () => {
  it('rejects an empty brief before touching the network', async () => {
    await expect(generateFloorPlan('   ', { key: 'sk-x' })).rejects.toBeInstanceOf(AiPlanError)
  })

  it('rejects a missing key', async () => {
    await expect(generateFloorPlan('a 4-room HDB', { key: '' })).rejects.toBeInstanceOf(AiPlanError)
  })

  it('refuses an insecure (plaintext remote) endpoint', async () => {
    await expect(
      generateFloorPlan('a 4-room HDB', { key: 'sk-x', url: 'http://evil.test/v1/chat' }),
    ).rejects.toBeInstanceOf(AiPlanError)
  })
})
