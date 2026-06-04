import { describe, expect, it } from 'vitest'
import { buildReplicateImg2ImgBody, parseReplicateOutput } from './aiClient'

describe('buildReplicateImg2ImgBody', () => {
  it('passes the image + prompt and a structure-preserving default strength', () => {
    const body = buildReplicateImg2ImgBody(
      { image: 'data:image/png;base64,xxx', prompt: 'scandinavian living room' },
      'model-v1',
    )
    expect(body.version).toBe('model-v1')
    expect(body.input.image).toBe('data:image/png;base64,xxx')
    expect(body.input.prompt).toBe('scandinavian living room')
    expect(body.input.prompt_strength).toBe(0.45)
    expect(body.input.negative_prompt).toMatch(/deformed|distorted/)
  })

  it('honours an explicit strength', () => {
    const body = buildReplicateImg2ImgBody({ image: 'd', prompt: 'p', strength: 0.7 }, 'm')
    expect(body.input.prompt_strength).toBe(0.7)
  })
})

describe('parseReplicateOutput', () => {
  it('returns the first url from a succeeded prediction (array output)', () => {
    expect(parseReplicateOutput({ status: 'succeeded', output: ['https://img/a.png', 'b'] })).toBe(
      'https://img/a.png',
    )
  })
  it('returns a string output directly', () => {
    expect(parseReplicateOutput({ status: 'succeeded', output: 'https://img/x.png' })).toBe(
      'https://img/x.png',
    )
  })
  it('returns null while not yet succeeded or when malformed', () => {
    expect(parseReplicateOutput({ status: 'processing' })).toBeNull()
    expect(parseReplicateOutput({ status: 'succeeded', output: [] })).toBeNull()
    expect(parseReplicateOutput(null)).toBeNull()
  })
})
