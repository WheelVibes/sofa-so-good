import { describe, expect, it } from 'vitest'
import { DOCS_URL, openDocs } from './docsUrl'

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
