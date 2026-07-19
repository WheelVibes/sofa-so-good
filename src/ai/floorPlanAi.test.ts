import { describe, expect, it } from 'vitest'
import {
  buildVisionRequest,
  classifyVisionEndpoint,
  extractContent,
  parseVisionResponse,
  parseWallsResponse,
} from './floorPlanAi'

describe('classifyVisionEndpoint', () => {
  it('trusts the default OpenAI endpoint', () => {
    const c = classifyVisionEndpoint('https://api.openai.com/v1/chat/completions')
    expect(c.secure).toBe(true)
    expect(c.trusted).toBe(true)
    expect(c.reason).toBeUndefined()
  })

  it('refuses a plaintext remote endpoint (key would leak on the wire)', () => {
    const c = classifyVisionEndpoint('http://evil.example.com/v1')
    expect(c.secure).toBe(false)
    expect(c.reason).toMatch(/insecure/i)
  })

  it('allows a localhost proxy over http', () => {
    const c = classifyVisionEndpoint('http://localhost:3001/v1/chat/completions')
    expect(c.secure).toBe(true)
    expect(c.trusted).toBe(true)
  })

  it('flags an unknown https host as untrusted (still secure)', () => {
    const c = classifyVisionEndpoint('https://my-proxy.example.net/v1')
    expect(c.secure).toBe(true)
    expect(c.trusted).toBe(false)
    expect(c.host).toBe('my-proxy.example.net')
    expect(c.reason).toMatch(/not a recognised/i)
  })

  it('reports an invalid URL', () => {
    const c = classifyVisionEndpoint('not a url')
    expect(c.secure).toBe(false)
    expect(c.reason).toMatch(/invalid/i)
  })
})

describe('parseWallsResponse', () => {
  it('parses a clean JSON walls object', () => {
    const walls = parseWallsResponse(
      '{"walls":[{"x1":0,"z1":0,"x2":4,"z2":0,"external":true},{"x1":2,"z1":0,"x2":2,"z2":3}]}',
    )
    expect(walls).toHaveLength(2)
    expect(walls[0]).toEqual({ x1: 0, z1: 0, x2: 4, z2: 0, external: true })
    expect(walls[1].external).toBe(false)
  })

  it('tolerates code fences and surrounding prose', () => {
    const walls = parseWallsResponse(
      'Here you go:\n```json\n{"walls":[{"x1":0,"z1":0,"x2":3.5,"z2":0}]}\n```\nHope that helps!',
    )
    expect(walls).toHaveLength(1)
    expect(walls[0].x2).toBe(3.5)
  })

  it('drops degenerate + malformed segments', () => {
    const walls = parseWallsResponse(
      '{"walls":[{"x1":0,"z1":0,"x2":0,"z2":0},{"x1":"a","z1":0,"x2":1,"z2":1},{"x1":0,"z1":0,"x2":5,"z2":0}]}',
    )
    expect(walls).toHaveLength(1)
    expect(walls[0].x2).toBe(5)
  })

  it('returns [] for non-JSON / missing walls', () => {
    expect(parseWallsResponse('sorry, I cannot help')).toEqual([])
    expect(parseWallsResponse('{"foo":1}')).toEqual([])
    expect(parseWallsResponse('')).toEqual([])
  })
})

describe('parseVisionResponse', () => {
  it('parses walls + openings + a direct scale', () => {
    const r = parseVisionResponse(
      '{"walls":[{"x1":0,"z1":0,"x2":4,"z2":0,"external":true}],' +
        '"openings":[{"kind":"door","x":1,"z":0,"width":0.9},' +
        '{"kind":"window","x":3,"z":0,"width":1.2}],' +
        '"scale":{"metresPerPixel":0.02}}',
    )
    expect(r.walls).toHaveLength(1)
    expect(r.openings).toEqual([
      { kind: 'door', x: 1, z: 0, width: 0.9 },
      { kind: 'window', x: 3, z: 0, width: 1.2 },
    ])
    expect(r.mPerPx).toBe(0.02)
  })

  it('derives scale from a reference span (pixels + metres)', () => {
    const r = parseVisionResponse(
      '{"walls":[{"x1":0,"z1":0,"x2":4,"z2":0}],"scale":{"pixels":100,"metres":2}}',
    )
    expect(r.mPerPx).toBe(0.02)
  })

  it('falls back to walls-only when openings + scale are absent (backward compatible)', () => {
    const r = parseVisionResponse('{"walls":[{"x1":0,"z1":0,"x2":4,"z2":0}]}')
    expect(r.walls).toHaveLength(1)
    expect(r.openings).toEqual([])
    expect(r.mPerPx).toBeUndefined()
  })

  it('drops malformed opening entries but keeps the good ones (defaults a bad width)', () => {
    const r = parseVisionResponse(
      '{"walls":[{"x1":0,"z1":0,"x2":4,"z2":0}],"openings":[' +
        '{"kind":"door","x":1,"z":0,"width":0.9},' + // good
        '{"kind":"portal","x":2,"z":0,"width":1},' + // bad kind → dropped
        '{"kind":"window","x":"nope","z":0,"width":1},' + // bad centre → dropped
        '{"kind":"window","x":3,"z":0}]}', // missing width → default 1.2
    )
    expect(r.openings).toEqual([
      { kind: 'door', x: 1, z: 0, width: 0.9 },
      { kind: 'window', x: 3, z: 0, width: 1.2 },
    ])
  })

  it('ignores an unusable / non-positive scale', () => {
    expect(parseVisionResponse('{"walls":[{"x1":0,"z1":0,"x2":4,"z2":0}],"scale":{}}').mPerPx).toBe(
      undefined,
    )
    expect(
      parseVisionResponse('{"walls":[{"x1":0,"z1":0,"x2":4,"z2":0}],"scale":{"metresPerPixel":0}}')
        .mPerPx,
    ).toBeUndefined()
  })

  it('returns empty walls/openings for non-JSON', () => {
    expect(parseVisionResponse('sorry')).toEqual({ walls: [], openings: [] })
  })
})

describe('extractContent', () => {
  it('reads string content', () => {
    expect(extractContent({ choices: [{ message: { content: 'hi' } }] })).toBe('hi')
  })
  it('joins array (multimodal) content parts', () => {
    expect(
      extractContent({ choices: [{ message: { content: [{ text: 'a' }, { text: 'b' }] } }] }),
    ).toBe('ab')
  })
  it('returns empty string when absent', () => {
    expect(extractContent({})).toBe('')
  })
})

describe('buildVisionRequest', () => {
  it('embeds the image and asks for JSON walls', () => {
    const req = buildVisionRequest('data:image/png;base64,zzz', 'gpt-4o')
    expect(req.model).toBe('gpt-4o')
    const userMsg = req.messages.find((m) => m.role === 'user')
    const img = (userMsg?.content as Array<{ type: string; image_url?: { url: string } }>).find(
      (p) => p.type === 'image_url',
    )
    expect(img?.image_url?.url).toBe('data:image/png;base64,zzz')
  })
})
