import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SAVED_EMPTY } from './savedEmptyStates'

/**
 * UIUX-74: the four saved-collection lists each render on a desktop toolbar
 * menu AND a mobile sheet section. They drifted — mobile File hand-rolled
 * `<div className="m-empty">No saved layouts.</div>` where desktop used the
 * shared `EmptyState`, and mobile Arrange/View showed nothing at all — so both
 * surfaces now spread one record. These tests pin the record's shape and, more
 * importantly, that every surface still reads it instead of re-inlining copy.
 */

const UI = join(__dirname, '..')
const read = (rel: string) => readFileSync(join(UI, rel), 'utf8')

/** Each key's [desktop, mobile] file pair, relative to `src/ui`. */
const SURFACES: Record<keyof typeof SAVED_EMPTY, [string, string]> = {
  layouts: ['toolbar/menus/FileMenu.tsx', 'toolbar/mobile/FileSection.tsx'],
  sets: ['toolbar/menus/ArrangeMenu.tsx', 'toolbar/mobile/ArrangeSection.tsx'],
  styles: ['toolbar/menus/ArrangeMenu.tsx', 'toolbar/mobile/ArrangeSection.tsx'],
  views: ['toolbar/menus/SavedViewsSection.tsx', 'toolbar/mobile/ViewSection.tsx'],
}

describe('SAVED_EMPTY', () => {
  it('gives every saved collection an icon, a headline and an actionable hint', () => {
    for (const [key, copy] of Object.entries(SAVED_EMPTY)) {
      expect(typeof copy.icon, key).toBe('function')
      // Headline names the collection and its emptiness; hint says how to fill it.
      expect(copy.title, key).toMatch(/^No saved \w+ yet$/)
      expect(copy.description, key).toBeTruthy()
      expect((copy.description as string).length, key).toBeLessThan(60)
    }
  })

  it('is the single source of copy for all four collections', () => {
    expect(Object.keys(SAVED_EMPTY).sort()).toEqual(['layouts', 'sets', 'styles', 'views'])
  })

  for (const [key, [desktop, mobile]] of Object.entries(SURFACES)) {
    it(`is spread by both the desktop and mobile ${key} surface`, () => {
      const spread = `<EmptyState {...SAVED_EMPTY.${key}} />`
      expect(read(desktop), desktop).toContain(spread)
      expect(read(mobile), mobile).toContain(spread)
    })

    it(`no surface re-inlines the ${key} copy`, () => {
      // A literal headline in the TSX means someone rebuilt the empty state by
      // hand — the exact drift this record exists to prevent.
      for (const f of [desktop, mobile]) {
        expect(read(f), f).not.toContain(SAVED_EMPTY[key as keyof typeof SAVED_EMPTY].title)
      }
    })
  }

  it('the mobile sheet keeps no hand-rolled empty-text class', () => {
    // `.m-empty` was the one-off the File section used; it has no consumers and
    // no rule left, so a new one would be a fresh divergence.
    for (const f of new Set(Object.values(SURFACES).flat())) {
      expect(read(f), f).not.toContain('m-empty')
    }
  })
})
