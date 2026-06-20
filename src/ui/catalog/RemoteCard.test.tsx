import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RemoteEntry } from '../../catalog/remote/types'
import { useStore } from '../../state/store'

// Mock the network/IDB-backed hooks. formatBytes lives in utils/measurement (not
// mocked here) so the rendered card shows the real formatted string. useAssetSize
// is what this feature adds.
const sizeRef = { current: undefined as number | null | undefined }
vi.mock('../../catalog/remote/hooks', async (orig) => {
  const real = (await orig()) as Record<string, unknown>
  return {
    ...real,
    useThumbnail: () => undefined,
    useResolveStatus: () => 'idle' as const,
    useAssetSize: () => sizeRef.current,
  }
})

import { RemoteCard } from './RemoteCard'

const entry: RemoteEntry = {
  provider: 'polyhaven',
  slug: 'big_chair',
  kind: 'furniture',
  name: 'Big Lounge Chair',
  category: 'seating',
  thumbUrl: 'x',
  resolutions: ['1k', '2k', '4k'],
  attribution: 'Poly Haven — Test',
  sourceUrl: 'x',
}

describe('RemoteCard size estimate', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('shows the formatted download size on the card', () => {
    sizeRef.current = 47 * 1024 * 1024
    render(<RemoteCard entry={entry} onResolved={() => {}} />)
    expect(screen.getByText(/47 MB/)).toBeInTheDocument()
  })

  it('falls back to the plain prompt when the size is unknown', () => {
    sizeRef.current = null
    render(<RemoteCard entry={entry} onResolved={() => {}} />)
    expect(screen.getByText(/tap to add/)).toBeInTheDocument()
  })

  it('swallows a failed download — no unhandled rejection, no onResolved (BUG-005)', async () => {
    sizeRef.current = null
    const onResolved = vi.fn()
    const reject = vi.fn(async () => {
      throw new Error('offline')
    })
    useStore.setState({ resolveRemoteAsset: reject } as Partial<
      ReturnType<typeof useStore.getState>
    >)
    render(<RemoteCard entry={entry} onResolved={onResolved} />)
    fireEvent.click(screen.getByRole('button', { name: /Add Big Lounge Chair/ }))
    await waitFor(() => expect(reject).toHaveBeenCalled())
    // The click handler caught the rejection: onResolved must NOT fire.
    expect(onResolved).not.toHaveBeenCalled()
  })
})
