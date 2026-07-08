import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../state/store'
import { decideDesktopUpdate, releaseTagToVersion, runDesktopUpdateCheck } from './updateCheck'

describe('releaseTagToVersion', () => {
  it('accepts v-prefixed and bare tags, 2–4 parts', () => {
    expect(releaseTagToVersion('v0.9.1.0')).toBe('0.9.1.0')
    expect(releaseTagToVersion('0.9.1')).toBe('0.9.1')
    expect(releaseTagToVersion('v1.0')).toBe('1.0')
    expect(releaseTagToVersion(' v2.3.4 ')).toBe('2.3.4')
  })

  it('rejects non-version tags and non-strings', () => {
    expect(releaseTagToVersion('latest')).toBeNull()
    expect(releaseTagToVersion('v1.2.3-beta.1')).toBeNull()
    expect(releaseTagToVersion('')).toBeNull()
    expect(releaseTagToVersion(undefined)).toBeNull()
    expect(releaseTagToVersion(123)).toBeNull()
  })
})

describe('decideDesktopUpdate', () => {
  it('flags a newer release as an update', () => {
    expect(decideDesktopUpdate('v0.9.2.0', '0.9.1.0')).toEqual({
      status: 'update',
      version: '0.9.2.0',
    })
    // 3-part tag vs 4-part running build: missing build part counts as 0.
    expect(decideDesktopUpdate('v0.10.0', '0.9.1.7')).toEqual({
      status: 'update',
      version: '0.10.0',
    })
  })

  it('treats same or older releases as up to date', () => {
    expect(decideDesktopUpdate('v0.9.1.0', '0.9.1.0')).toEqual({ status: 'uptodate' })
    expect(decideDesktopUpdate('v0.9.0.9', '0.9.1.0')).toEqual({ status: 'uptodate' })
  })

  it('reports unparseable tags as errors', () => {
    expect(decideDesktopUpdate('latest', '0.9.1.0')).toEqual({ status: 'error' })
    expect(decideDesktopUpdate(undefined, '0.9.1.0')).toEqual({ status: 'error' })
  })
})

describe('runDesktopUpdateCheck', () => {
  beforeEach(() => {
    useStore.setState({ notifications: [] })
  })

  it('in-flight guard: rapid presses collapse to one spinner and one result', async () => {
    let resolveFetch: ((v: Response) => void) | undefined
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((res) => {
          resolveFetch = res
        }),
    )
    try {
      // Three near-simultaneous presses while the GitHub fetch is outstanding.
      const runs = Promise.all([
        runDesktopUpdateCheck(),
        runDesktopUpdateCheck(),
        runDesktopUpdateCheck(),
      ])
      expect(useStore.getState().notifications.filter((n) => n.kind === 'progress')).toHaveLength(1)
      // The guard means only the first press actually reached fetch.
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      resolveFetch?.({ ok: true, json: async () => ({ tag_name: 'v0.0.0.0' }) } as Response)
      await runs
      const list = useStore.getState().notifications
      expect(list.filter((n) => /latest version/.test(n.title))).toHaveLength(1)
      expect(list.filter((n) => n.kind === 'progress')).toHaveLength(0)
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
