import { describe, expect, it } from 'vitest'
import { buildMoodboardHtml, escapeHtml, type MoodboardInput, sanitizeColor } from './moodboard'

function baseInput(overrides: Partial<MoodboardInput> = {}): MoodboardInput {
  return {
    title: 'My HDB Living Room',
    palette: [],
    materials: [],
    items: [],
    ...overrides,
  }
}

describe('escapeHtml', () => {
  it('escapes all five characters in text and attribute contexts', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;')
  })

  it('coerces nullish to empty string', () => {
    expect(escapeHtml(undefined)).toBe('')
    expect(escapeHtml(null)).toBe('')
  })
})

describe('sanitizeColor', () => {
  it('accepts and normalises hex', () => {
    expect(sanitizeColor('#abc')).toBe('#abc')
    expect(sanitizeColor('aabbcc')).toBe('#aabbcc')
    expect(sanitizeColor('#11223344')).toBe('#11223344')
  })

  it('accepts rgb/hsl function forms', () => {
    expect(sanitizeColor('rgb(10, 20, 30)')).toBe('rgb(10, 20, 30)')
    expect(sanitizeColor('hsla(200, 50%, 40%, 0.5)')).toBe('hsla(200, 50%, 40%, 0.5)')
  })

  it('rejects style-injection payloads', () => {
    expect(sanitizeColor('red;background:url(x)')).toBeNull()
    expect(sanitizeColor('url(javascript:alert(1))')).toBeNull()
    expect(sanitizeColor('')).toBeNull()
    expect(sanitizeColor(undefined)).toBeNull()
  })
})

describe('buildMoodboardHtml', () => {
  it('contains the title', () => {
    const html = buildMoodboardHtml(baseInput({ title: 'Scandi Loft' }))
    expect(html).toContain('Scandi Loft')
    expect(html).toMatch(/^<!doctype html>/)
  })

  it('renders one chip per valid palette colour', () => {
    const html = buildMoodboardHtml(
      baseInput({
        palette: [{ hex: '#ff0000', name: 'Tomato' }, { hex: '00ff00' }, { hex: 'rgb(0,0,255)' }],
      }),
    )
    const chips = html.match(/class="chip"/g) ?? []
    expect(chips).toHaveLength(3)
    expect(html).toContain('Tomato')
    expect(html).toContain('background:#ff0000')
    expect(html).toContain('background:#00ff00')
  })

  it('renders one tile per item with category and price', () => {
    const html = buildMoodboardHtml(
      baseInput({
        items: [
          { name: 'Sofa', category: 'Seating', count: 1, priceText: 'S$899' },
          { name: 'Lamp', count: 2 },
          { name: 'Rug' },
        ],
      }),
    )
    const tiles = html.match(/class="tile"/g) ?? []
    expect(tiles).toHaveLength(3)
    expect(html).toContain('Sofa')
    expect(html).toContain('Seating')
    expect(html).toContain('S$899')
    expect(html).toContain('x2')
  })

  it('renders a material strip', () => {
    const html = buildMoodboardHtml(
      baseInput({
        materials: [{ name: 'Oak Veneer', swatch: '#c2a06a' }, { name: 'Matte White' }],
      }),
    )
    expect(html).toContain('Oak Veneer')
    expect(html).toContain('Matte White')
    expect(html).toContain('background:#c2a06a')
    // the second material has no valid swatch -> falls back to no-swatch class
    expect(html).toContain('no-swatch')
  })

  it('embeds a data: hero image and rejects non-data hero urls', () => {
    const ok = buildMoodboardHtml(baseInput({ heroDataUrl: 'data:image/png;base64,AAAA' }))
    expect(ok).toContain('class="hero"')
    expect(ok).toContain('data:image/png;base64,AAAA')

    const bad = buildMoodboardHtml(
      baseInput({ heroDataUrl: 'https://evil.example/x.png' as string }),
    )
    expect(bad).not.toContain('class="hero"')
  })

  it('escapes a malicious item name (no script breakout)', () => {
    const html = buildMoodboardHtml(
      baseInput({ items: [{ name: '"><script>alert(1)</script>', category: '"></span><b>x' }] }),
    )
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('</script>')
    expect(html).not.toContain('"><script>')
    expect(html).toContain('&lt;script&gt;')
    // attribute-context breakout attempt is neutralised
    expect(html).not.toContain('"></span><b>x')
  })

  it('rejects a malicious hex / style-injection colour', () => {
    const html = buildMoodboardHtml(
      baseInput({
        palette: [
          { hex: 'red;background:url(x)', name: 'Bad' },
          { hex: '#0a0a0a', name: 'Good' },
        ],
      }),
    )
    // injected style is dropped entirely (no raw payload anywhere)
    expect(html).not.toContain('url(x)')
    expect(html).not.toContain('red;background')
    // and the bad chip is dropped, leaving only the valid one
    const chips = html.match(/class="chip"/g) ?? []
    expect(chips).toHaveLength(1)
    expect(html).toContain('background:#0a0a0a')
  })

  it('escapes malicious title and note in text + attribute contexts', () => {
    const html = buildMoodboardHtml(
      baseInput({ title: '</title><script>x</script>', note: '<img src=x onerror=alert(1)>' }),
    )
    expect(html).not.toContain('<script>x</script>')
    expect(html).not.toContain('<img src=x onerror=alert(1)>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('produces a valid minimal document for empty input without throwing', () => {
    const html = buildMoodboardHtml(baseInput())
    expect(html).toMatch(/^<!doctype html>/)
    expect(html).toContain('</html>')
    expect(html).toContain('My HDB Living Room')
    // no empty sections rendered
    expect(html).not.toContain('Colour palette')
    expect(html).not.toContain('Furniture')
    expect(html).not.toContain('class="hero"')
  })

  it('handles a completely default-empty input shape gracefully', () => {
    expect(() =>
      buildMoodboardHtml({ title: '', palette: [], materials: [], items: [] }),
    ).not.toThrow()
    const html = buildMoodboardHtml({ title: '', palette: [], materials: [], items: [] })
    expect(html).toContain('Moodboard')
  })
})
