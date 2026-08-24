// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RemoteEntry } from '../../catalog/remote/types'
import { useStore } from '../../state/store'

// Stub the network/IDB-backed card hooks so cards render names synchronously.
vi.mock('../../catalog/remote/hooks', async (orig) => {
  const real = (await orig()) as Record<string, unknown>
  return {
    ...real,
    useThumbnail: () => ({ url: undefined, failed: false, retry: () => {} }),
    useResolveStatus: () => 'idle' as const,
    useAssetSize: () => null,
  }
})

import { RemoteBrowseTab } from './RemoteBrowseTab'

const mat = (slug: string, name: string, category: 'floor' | 'wall'): RemoteEntry => ({
  provider: 'polyhaven',
  slug,
  kind: 'material',
  name,
  category,
  thumbUrl: 'x',
  resolutions: ['2k'],
  attribution: 'Poly Haven',
  sourceUrl: 'x',
})

describe('RemoteBrowseTab category filter', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
    useStore.setState((s) => ({
      remoteIndexes: {
        ...s.remoteIndexes,
        polyhaven: {
          status: 'ready',
          entries: [
            mat('oak_floor', 'Oak Floor', 'floor'),
            mat('brick_wall', 'Brick Wall', 'wall'),
          ],
        },
      },
    }))
  })

  it('defaults to the edited surface, hiding the other category', () => {
    render(<RemoteBrowseTab kind="material" onResolved={() => {}} defaultCategory="floor" />)
    expect(screen.getByText('Oak Floor')).toBeInTheDocument()
    expect(screen.queryByText('Brick Wall')).not.toBeInTheDocument()
  })

  it('shows both when no default category is given', () => {
    render(<RemoteBrowseTab kind="material" onResolved={() => {}} />)
    expect(screen.getByText('Oak Floor')).toBeInTheDocument()
    expect(screen.getByText('Brick Wall')).toBeInTheDocument()
  })
})

describe('RemoteBrowseTab error banner', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  const failWith = (error: string) =>
    useStore.setState((s) => ({
      remoteIndexes: {
        ...s.remoteIndexes,
        ambientcg: { status: 'error', entries: [], error },
      },
    }))

  it('calls an auth failure what it is instead of blaming the network', () => {
    // The ambientCG library is our own bucket (a local `resources/` mirror in
    // dev) behind the session gate — "check your internet" sends people hunting
    // for a problem that does not exist.
    failWith('Error: Sign in to load the ambientCG library')
    render(<RemoteBrowseTab kind="material" onResolved={() => {}} />)
    expect(screen.getByText(/Not authorized/)).toBeInTheDocument()
    expect(screen.queryByText(/internet connection/)).not.toBeInTheDocument()
  })

  it('says nothing in a production build — "sign in" is un-actionable there', () => {
    // Accounts are admin-created (no public signup), so a shipped build treats
    // an unauthenticated provider as simply unavailable: no banner, no Retry,
    // no red status chip.
    vi.stubEnv('DEV', false)
    failWith('Error: Sign in to load the ambientCG library')
    render(<RemoteBrowseTab kind="material" onResolved={() => {}} />)
    expect(screen.queryByText(/Not authorized/)).not.toBeInTheDocument()
    expect(screen.queryByText(/internet connection/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Retry ambientCG/ })).not.toBeInTheDocument()
    vi.unstubAllEnvs()
  })

  it('still reports a genuine outage in production', () => {
    vi.stubEnv('DEV', false)
    failWith('TypeError: Failed to fetch')
    render(<RemoteBrowseTab kind="material" onResolved={() => {}} />)
    expect(screen.getByText(/internet connection/)).toBeInTheDocument()
    vi.unstubAllEnvs()
  })

  it('still reports a genuine outage as one', () => {
    failWith('TypeError: Failed to fetch')
    render(<RemoteBrowseTab kind="material" onResolved={() => {}} />)
    expect(screen.getByText(/internet connection/)).toBeInTheDocument()
    expect(screen.queryByText(/Not authorized/)).not.toBeInTheDocument()
  })
})
