import { afterEach, describe, expect, it, vi } from 'vitest'
import { withBase } from './assetUrl'

describe('withBase', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns root-relative paths unchanged when base is "/" (dev)', () => {
    vi.stubEnv('BASE_URL', '/')
    expect(withBase('/assets/materials/floor-wood-oak/albedo.jpg')).toBe(
      '/assets/materials/floor-wood-oak/albedo.jpg',
    )
  })

  it('prefixes the sub-path base for production builds (GitHub Pages)', () => {
    vi.stubEnv('BASE_URL', '/sofa-so-good/')
    expect(withBase('/assets/materials/floor-wood-oak/albedo.jpg')).toBe(
      '/sofa-so-good/assets/materials/floor-wood-oak/albedo.jpg',
    )
    expect(withBase('/assets/CREDITS.json')).toBe('/sofa-so-good/assets/CREDITS.json')
  })

  it('leaves absolute and blob/data URLs untouched', () => {
    vi.stubEnv('BASE_URL', '/sofa-so-good/')
    expect(withBase('https://example.com/x.jpg')).toBe('https://example.com/x.jpg')
    expect(withBase('blob:http://localhost/abc')).toBe('blob:http://localhost/abc')
    expect(withBase('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA')
    expect(withBase('//cdn.example.com/x.jpg')).toBe('//cdn.example.com/x.jpg')
  })
})
