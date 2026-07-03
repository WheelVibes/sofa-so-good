// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import {
  DOC_PAGES,
  DOCS_URL,
  type DocKey,
  docsUrlFor,
  FEATURE_DOCS,
  openDocs,
  openToolDocs,
} from './docsUrl'

describe('docsUrl', () => {
  it('resolves under the app base path with a trailing docs/ segment', () => {
    // In Vitest, import.meta.env.BASE_URL is '/', so DOCS_URL is '/docs/'.
    expect(DOCS_URL).toBe('/docs/')
  })

  it('openDocs opens the docs URL in a new tab with noopener', () => {
    const calls: Array<[string, string, string]> = []
    const orig = window.open
    // @ts-expect-error test stub
    window.open = (url: string, target: string, features: string) => {
      calls.push([url, target, features])
      return null
    }
    openDocs()
    window.open = orig
    expect(calls).toEqual([['/docs/', '_blank', 'noopener,noreferrer']])
  })
})

describe('docsUrlFor', () => {
  it('builds a page#anchor URL for a mapped key', () => {
    expect(docsUrlFor('budget')).toBe('/docs/design-tools#budget-shopping-list')
    expect(docsUrlFor('designScore')).toBe('/docs/design-tools#design-score')
    expect(docsUrlFor('sunStudy')).toBe('/docs/walkthrough-and-sun-study#sun-study')
    expect(docsUrlFor('catalog')).toBe('/docs/placing-furniture#the-catalog')
  })

  it('links to the page top when there is no anchor', () => {
    expect(docsUrlFor('floorPlanEditor')).toBe('/docs/floor-plan-editor')
  })

  it('percent-encodes unicode anchors so the URL is valid', () => {
    // The '°' becomes %C2%B0; the VitePress router still matches the raw id.
    expect(docsUrlFor('panorama')).toBe('/docs/design-tools#_360%C2%B0-panorama-pro')
  })

  it('falls back to the guide home for an unmapped key', () => {
    expect(docsUrlFor('nonexistentFeature' as DocKey)).toBe(DOCS_URL)
  })

  it('openToolDocs opens the resolved URL (new tab, noopener)', () => {
    const calls: Array<[string, string, string]> = []
    const orig = window.open
    // @ts-expect-error test stub
    window.open = (url: string, target: string, features: string) => {
      calls.push([url, target, features])
      return null
    }
    openToolDocs('measure')
    openToolDocs('totallyUnknown' as DocKey)
    window.open = orig
    expect(calls).toEqual([
      ['/docs/design-tools#measure', '_blank', 'noopener,noreferrer'],
      [DOCS_URL, '_blank', 'noopener,noreferrer'],
    ])
  })

  it('every mapping points at a real guide page slug', () => {
    const pages = new Set<string>(DOC_PAGES)
    for (const [key, entry] of Object.entries(FEATURE_DOCS)) {
      expect(entry, key).toBeTruthy()
      expect(pages.has(entry!.page), `${key} → ${entry!.page}`).toBe(true)
      // index.md is a home-layout page with no usable anchors — never deep-link it.
      expect(entry!.page, key).not.toBe('index')
    }
  })
})
