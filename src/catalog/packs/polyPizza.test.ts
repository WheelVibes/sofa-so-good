import { describe, expect, it, vi } from 'vitest'
import { guessCategory, PolyPizzaError, parseModels, searchPolyPizza } from './polyPizza'

describe('parseModels', () => {
  it('parses capitalized API fields and builds attribution', () => {
    const [m] = parseModels({
      results: [
        {
          ID: 'abc',
          Title: 'Wooden Chair',
          Creator: { Username: 'jane' },
          License: 'CC0',
          Thumbnail: 'https://t/abc.png',
          Download: 'https://dl/abc.glb',
        },
      ],
    })
    expect(m.id).toBe('abc')
    expect(m.name).toBe('Wooden Chair')
    expect(m.author).toBe('jane')
    expect(m.license).toBe('CC0')
    expect(m.downloadUrl).toBe('https://dl/abc.glb')
    expect(m.category).toBe('seating')
    expect(m.attribution).toContain('Poly Pizza')
  })

  it('tolerates lowercase field variants and "Licence" spelling', () => {
    const [m] = parseModels({
      results: [
        {
          id: 'x',
          name: 'Side Table',
          author: 'bob',
          Licence: 'CC-BY 3.0',
          downloadUrl: 'https://dl/x.glb',
        },
      ],
    })
    expect(m.license).toBe('CC-BY')
    expect(m.category).toBe('tables')
  })

  it('skips entries with no download url or id', () => {
    const models = parseModels({
      results: [
        { ID: 'a', Title: 'No download' },
        { Title: 'No id', Download: 'https://dl/y.glb' },
        { ID: 'c', Title: 'Lamp', Download: 'https://dl/c.glb' },
      ],
    })
    expect(models.map((m) => m.id)).toEqual(['c'])
    expect(models[0].category).toBe('lighting')
  })

  it('returns empty for empty/absent results', () => {
    expect(parseModels({})).toEqual([])
    expect(parseModels({ results: [] })).toEqual([])
  })
})

describe('guessCategory', () => {
  it('maps keywords to furniture categories, unknown → others', () => {
    expect(guessCategory('King Bed')).toBe('beds')
    expect(guessCategory('Bookcase')).toBe('storage')
    expect(guessCategory('Floor Lamp')).toBe('lighting')
    expect(guessCategory('Refrigerator')).toBe('appliances')
    expect(guessCategory('Mystery Object')).toBe('others')
  })
})

describe('searchPolyPizza', () => {
  const okResponse = (results: unknown[]) =>
    ({ ok: true, json: async () => ({ results }) }) as unknown as Response

  it('rejects an empty API key without fetching', async () => {
    const fetchImpl = vi.fn()
    await expect(searchPolyPizza('  ', 'chair', { fetchImpl })).rejects.toBeInstanceOf(
      PolyPizzaError,
    )
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('sends the x-auth-token header and term-path URL', async () => {
    const fetchImpl = vi.fn(async () =>
      okResponse([{ ID: '1', Title: 'Chair', Download: 'https://d/1.glb' }]),
    )
    await searchPolyPizza('KEY', 'office chair', { fetchImpl, limit: 5 })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.poly.pizza/v1.1/search/office%20chair?limit=5')
    expect(init.headers).toMatchObject({ 'x-auth-token': 'KEY' })
  })

  it('maps 401 to an actionable key error', async () => {
    const fetchImpl = vi.fn(
      async () =>
        ({ ok: false, status: 401, json: async () => ({ error: 'bad' }) }) as unknown as Response,
    )
    await expect(searchPolyPizza('KEY', 'chair', { fetchImpl })).rejects.toThrow(/API key/i)
  })

  it('maps 429 to a rate-limit error', async () => {
    const fetchImpl = vi.fn(
      async () => ({ ok: false, status: 429, json: async () => ({}) }) as unknown as Response,
    )
    await expect(searchPolyPizza('KEY', 'chair', { fetchImpl })).rejects.toThrow(/rate limit/i)
  })

  it('maps a thrown TypeError (network/CORS) to a friendly message', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(searchPolyPizza('KEY', 'chair', { fetchImpl })).rejects.toThrow(/network or CORS/i)
  })

  it('throws when no downloadable models match', async () => {
    const fetchImpl = vi.fn(async () => okResponse([]))
    await expect(searchPolyPizza('KEY', 'zzz', { fetchImpl })).rejects.toThrow(/No downloadable/i)
  })
})
