import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DEV_LIBRARY_DIRS,
  describeMirrors,
  mirrorKeyPaths,
  mirrorRoots,
  resolveMirrorPath,
} from './devLibraryMirror'

const ROOT = '/repo'
const R2 = resolve(ROOT, 'resources')
const LEGACY = resolve(ROOT, 'ikea_optimized')

/** A fake filesystem: an exists() over a set of absolute paths. */
const fs = (...paths: string[]) => {
  const set = new Set(paths)
  return (p: string) => set.has(p)
}

describe('mirrorRoots', () => {
  it('searches the R2-shaped mirror before the legacy scrape tree', () => {
    expect(mirrorRoots(ROOT)).toEqual([R2, LEGACY])
    expect(DEV_LIBRARY_DIRS[0]).toBe('resources')
  })

  it('honours an explicit DEV_LIBRARY_DIR outright (relative or absolute)', () => {
    expect(mirrorRoots(ROOT, 'mirror')).toEqual([resolve(ROOT, 'mirror')])
    expect(mirrorRoots(ROOT, '/mnt/lib')).toEqual(['/mnt/lib'])
    // Blank/whitespace env values fall back to the defaults rather than resolving
    // to the repo root (which would serve nothing and report "no manifest").
    expect(mirrorRoots(ROOT, '  ')).toEqual([R2, LEGACY])
  })
})

describe('mirrorKeyPaths', () => {
  it('tries the exact key first, then the legacy rewrite', () => {
    expect(mirrorKeyPaths(LEGACY, 'library/index.json')).toEqual([
      `${LEGACY}/library/index.json`,
      `${LEGACY}/library-index.json`,
    ])
    expect(mirrorKeyPaths(LEGACY, 'ikea/desk/white.glb')).toEqual([
      `${LEGACY}/ikea/desk/white.glb`,
      `${LEGACY}/desk/white.glb`,
    ])
  })

  it('has no legacy form for an acg/ key (the flat tree cannot express it)', () => {
    expect(mirrorKeyPaths(R2, 'acg/Bricks030/albedo.webp')).toEqual([
      `${R2}/acg/Bricks030/albedo.webp`,
    ])
    expect(mirrorKeyPaths(R2, 'library/acg-index.json')).toEqual([`${R2}/library/acg-index.json`])
  })

  it('drops any candidate that escapes the mirror root', () => {
    expect(mirrorKeyPaths(R2, '../secrets.json')).toEqual([])
    expect(mirrorKeyPaths(R2, 'ikea/../../secrets.json')).toEqual([])
  })
})

describe('resolveMirrorPath', () => {
  const roots = [R2, LEGACY]

  it('serves the ambientCG manifest + maps from the R2-shaped mirror', () => {
    const exists = fs(`${R2}/library/acg-index.json`, `${R2}/acg/Bricks030/albedo.webp`)
    expect(resolveMirrorPath(roots, 'library/acg-index.json', exists)).toBe(
      `${R2}/library/acg-index.json`,
    )
    expect(resolveMirrorPath(roots, 'acg/Bricks030/albedo.webp', exists)).toBe(
      `${R2}/acg/Bricks030/albedo.webp`,
    )
  })

  it('still serves a legacy flat scrape tree', () => {
    const exists = fs(`${LEGACY}/library-index.json`, `${LEGACY}/desk/white.glb`)
    expect(resolveMirrorPath(roots, 'library/index.json', exists)).toBe(
      `${LEGACY}/library-index.json`,
    )
    expect(resolveMirrorPath(roots, 'ikea/desk/white.glb', exists)).toBe(`${LEGACY}/desk/white.glb`)
  })

  it('mixes roots per key — ambientCG from resources/, IKEA from the scrape', () => {
    const exists = fs(`${R2}/library/acg-index.json`, `${LEGACY}/desk/white.glb`)
    expect(resolveMirrorPath(roots, 'library/acg-index.json', exists)).toBe(
      `${R2}/library/acg-index.json`,
    )
    expect(resolveMirrorPath(roots, 'ikea/desk/white.glb', exists)).toBe(`${LEGACY}/desk/white.glb`)
  })

  it('prefers the earlier root when both hold the key', () => {
    const exists = fs(`${R2}/library/index.json`, `${LEGACY}/library-index.json`)
    expect(resolveMirrorPath(roots, 'library/index.json', exists)).toBe(`${R2}/library/index.json`)
  })

  it('returns null for a key in no mirror (→ the 404 an empty bucket gives)', () => {
    expect(resolveMirrorPath(roots, 'acg/Bricks030/albedo.webp', fs())).toBeNull()
  })
})

describe('describeMirrors', () => {
  it('reports each present root and the catalogs it can serve', () => {
    const exists = fs(R2, `${R2}/library/acg-index.json`, LEGACY, `${LEGACY}/library-index.json`)
    const { lines, found } = describeMirrors([R2, LEGACY], exists)
    expect(found.sort()).toEqual(['ambientcg', 'ikea'])
    expect(lines).toEqual([`${R2} (ambientcg manifests)`, `${LEGACY} (ikea manifests)`])
  })

  it('skips absent roots and reports nothing found for an empty mirror', () => {
    const { lines, found } = describeMirrors([R2, LEGACY], fs(R2))
    expect(found).toEqual([])
    expect(lines).toEqual([`${R2} (no manifest)`])
  })
})
