import { describe, expect, it } from 'vitest'
import { buildVisionRequest, extractContent, parseWallsResponse } from './floorPlanAi'

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
