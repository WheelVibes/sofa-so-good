import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reverseGeocode, searchPlaces } from './geocoding'

const originalFetch = globalThis.fetch

describe('searchPlaces', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    globalThis.fetch = originalFetch
  })

  it('returns parsed results from Nominatim', async () => {
    const mockFetch = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        {
          display_name: 'London, Greater London, England, UK',
          lat: '51.5073509',
          lon: '-0.1277583',
        },
        { display_name: 'London, Ontario, Canada', lat: '42.9869502', lon: '-81.2496256' },
      ],
    } as Response)

    const results = await searchPlaces('London')
    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({
      label: 'London, Greater London, England, UK',
      lat: 51.5073509,
      lon: -0.1277583,
    })
  })

  it('rejects with an Error on non-ok responses', async () => {
    const mockFetch = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    } as Response)

    await expect(searchPlaces('Tokyo')).rejects.toThrow(/429/)
  })

  it('returns an empty array for queries shorter than 2 characters', async () => {
    const mockFetch = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    const results = await searchPlaces('a')
    expect(results).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('passes the User-Agent header per Nominatim policy', async () => {
    const mockFetch = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] } as Response)
    await searchPlaces('Paris')
    const call = mockFetch.mock.calls[0]
    const init = call[1] as RequestInit | undefined
    const headers = (init?.headers ?? {}) as Record<string, string>
    expect(headers['User-Agent']).toMatch(/sofa-so-good/)
  })
})

describe('reverseGeocode', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the display_name for a coordinate', async () => {
    const mockFetch = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ display_name: 'Singapore, Central, Singapore' }),
    } as Response)
    const label = await reverseGeocode(1.35, 103.82)
    expect(label).toBe('Singapore, Central, Singapore')
  })

  it('returns null when Nominatim has no result', async () => {
    const mockFetch = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ error: 'Unable to geocode' }),
    } as Response)
    const label = await reverseGeocode(0, 0)
    expect(label).toBeNull()
  })

  it('returns null on network errors instead of throwing', async () => {
    const mockFetch = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    mockFetch.mockRejectedValueOnce(new Error('network down'))
    const label = await reverseGeocode(1.35, 103.82)
    expect(label).toBeNull()
  })
})
