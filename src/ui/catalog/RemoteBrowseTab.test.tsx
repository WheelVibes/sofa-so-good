import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RemoteEntry } from '../../catalog/remote/types'
import { useStore } from '../../state/store'

// Stub the network/IDB-backed card hooks so cards render names synchronously.
vi.mock('../../catalog/remote/hooks', async (orig) => {
  const real = (await orig()) as Record<string, unknown>
  return {
    ...real,
    useThumbnail: () => undefined,
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
