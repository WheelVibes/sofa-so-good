/**
 * TEST-8 — `paletteFromPhoto.ts` nearest-finish mapping.
 *
 * The pure glue (`finishCandidates`/`mapPaletteToFinishes`) between the
 * (already-tested) `extractPalette`/`nearestColor` core and the builtin
 * finish catalog lives in the sibling `paletteFromPhotoMatch.ts` (split out
 * so it can be unit-tested without pulling in `paletteFromPhoto.ts`'s DOM-bound
 * canvas decode + store wiring). `imageToPixels` (canvas decode) is out of
 * scope — it can't run headlessly and isn't touched here.
 */

import { describe, expect, it, vi } from 'vitest'
import type { PaletteColor } from '../analysis/imagePalette'
import { hexToRgb } from '../materials/procedural/noise'

describe('finishCandidates', () => {
  it('returns a candidate for every floor + wall builtin material with a swatch, with correct rgb', async () => {
    const { BUILTIN_MATERIALS_BY_CATEGORY } = await import('../materials/builtinCatalog')
    const { finishCandidates } = await import('./paletteFromPhotoMatch')

    const expected = (['floor', 'wall'] as const).flatMap((cat) =>
      (BUILTIN_MATERIALS_BY_CATEGORY[cat] ?? [])
        .filter((m) => m.swatch)
        .map((m) => {
          const [r, g, b] = hexToRgb(m.swatch as string)
          return { r, g, b, name: m.name, swatch: m.swatch }
        }),
    )

    const actual = finishCandidates()
    expect(actual).toEqual(expected)
    expect(actual.length).toBeGreaterThan(0)
    // Sanity-check a couple of real entries resolve to the right rgb.
    const oak = actual.find((c) => c.name === 'Oak planks')
    expect(oak).toEqual({ r: 0xb8, g: 0x8f, b: 0x5d, name: 'Oak planks', swatch: '#b88f5d' })
    const white = actual.find((c) => c.swatch === '#f5f5f0')
    expect(white).toBeDefined()
  })

  it('draws only from the floor and wall categories, and skips entries without a swatch', async () => {
    vi.resetModules()
    vi.doMock('../materials/builtinCatalog', () => ({
      BUILTIN_MATERIALS_BY_CATEGORY: {
        floor: [{ id: 'f1', name: 'Floor one', category: 'floor', swatch: '#112233' }],
        wall: [
          { id: 'w1', name: 'Wall one', category: 'wall', swatch: '#445566' },
          // No swatch — must be skipped, not thrown on.
          { id: 'w2', name: 'Wall no-swatch', category: 'wall' },
        ],
        // Not a real MaterialCategory, but proves the loop is hardcoded to
        // ['floor', 'wall'] and won't pick up a stray category key.
        ceiling: [{ id: 'c1', name: 'Ceiling one', category: 'ceiling', swatch: '#778899' }],
      },
    }))

    const { finishCandidates } = await import('./paletteFromPhotoMatch')
    const candidates = finishCandidates()

    expect(candidates).toEqual([
      { r: 0x11, g: 0x22, b: 0x33, name: 'Floor one', swatch: '#112233' },
      { r: 0x44, g: 0x55, b: 0x66, name: 'Wall one', swatch: '#445566' },
    ])
    expect(candidates.some((c) => c.name === 'Ceiling one')).toBe(false)
    expect(candidates.some((c) => c.name === 'Wall no-swatch')).toBe(false)

    vi.doUnmock('../materials/builtinCatalog')
    vi.resetModules()
  })

  it('returns an empty array when a category has no materials', async () => {
    vi.resetModules()
    vi.doMock('../materials/builtinCatalog', () => ({
      BUILTIN_MATERIALS_BY_CATEGORY: { floor: [], wall: [] },
    }))

    const { finishCandidates } = await import('./paletteFromPhotoMatch')
    expect(finishCandidates()).toEqual([])

    vi.doUnmock('../materials/builtinCatalog')
    vi.resetModules()
  })
})

describe('mapPaletteToFinishes', () => {
  const paletteColor = (
    hex: string,
    r: number,
    g: number,
    b: number,
    weight = 1,
  ): PaletteColor => ({
    r,
    g,
    b,
    hex,
    weight,
  })

  it('picks the nearest candidate by rgb distance and labels it with the source hex', async () => {
    const { mapPaletteToFinishes } = await import('./paletteFromPhotoMatch')
    const candidates = [
      { r: 255, g: 0, b: 0, name: 'Red', swatch: '#ff0000' },
      { r: 0, g: 255, b: 0, name: 'Green', swatch: '#00ff00' },
      { r: 0, g: 0, b: 255, name: 'Blue', swatch: '#0000ff' },
    ]
    const palette = [paletteColor('#fa0a05', 250, 10, 5)]

    const result = mapPaletteToFinishes(palette, candidates)

    expect(result).toEqual([{ name: 'Red (≈ #fa0a05)', swatch: '#ff0000' }])
  })

  it('breaks an exact tie by picking the first candidate in the list (nearestColor contract)', async () => {
    const { mapPaletteToFinishes } = await import('./paletteFromPhotoMatch')
    const candidates = [
      { r: 255, g: 0, b: 0, name: 'Red', swatch: '#ff0000' },
      { r: 0, g: 255, b: 0, name: 'Green', swatch: '#00ff00' },
    ]
    // Equidistant from Red and Green.
    const palette = [paletteColor('#808000', 128, 128, 0)]

    const result = mapPaletteToFinishes(palette, candidates)

    expect(result).toEqual([{ name: 'Red (≈ #808000)', swatch: '#ff0000' }])
  })

  it('falls back to the palette colour itself (as both name and swatch) when there are no candidates', async () => {
    const { mapPaletteToFinishes } = await import('./paletteFromPhotoMatch')
    const palette = [paletteColor('#abcdef', 0xab, 0xcd, 0xef)]

    const result = mapPaletteToFinishes(palette, [])

    expect(result).toEqual([{ name: '#abcdef', swatch: '#abcdef' }])
  })

  it('returns an empty array for an empty palette', async () => {
    const { mapPaletteToFinishes } = await import('./paletteFromPhotoMatch')
    const result = mapPaletteToFinishes(
      [],
      [{ r: 0, g: 0, b: 0, name: 'Black', swatch: '#000000' }],
    )
    expect(result).toEqual([])
  })

  it('defaults to the real builtin finishCandidates() and matches a known, unambiguous swatch', async () => {
    const { mapPaletteToFinishes } = await import('./paletteFromPhotoMatch')
    // '#3b4a63' (Navy wall paint) is unique in the builtin catalog, so an
    // extracted colour equal to it must resolve to exactly that finish.
    const palette = [paletteColor('#3b4a63', 0x3b, 0x4a, 0x63)]

    const [result] = mapPaletteToFinishes(palette)

    expect(result?.name).toBe('Navy (≈ #3b4a63)')
    expect(result?.swatch).toBe('#3b4a63')
  })
})
