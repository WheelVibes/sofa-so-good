// @vitest-environment happy-dom
/**
 * SHOWROOM-FINISHES — the one-tap curated strip: renders a chip per curated
 * finish for the surface, resolves-then-applies on tap (or applies immediately
 * when already resolved), and the FinishPicker mounts it in BOTH Simple and
 * Pro modes (simple-tier flag) and hides it when the flag is off.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SHOWROOM_RESOLUTION,
  showroomFinishes,
  showroomFinishId,
} from '../../materials/showroomCatalog'
import { useStore } from '../../state/store'
import { FinishPicker } from '../FinishPicker'
import { ShowroomRow } from './ShowroomRow'

// Swatch thumbnails paint a 2D canvas, which happy-dom doesn't implement —
// stub just the data-URL generator (same as the other FinishPicker tests).
vi.mock('../../materials/procedural/generators', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  proceduralThumbnailDataUrl: () => 'data:,',
}))
vi.mock('../../materials/recolor', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  recolorThumbnailDataUrl: async () => null,
}))

const ROOM = 'livingDining'

beforeEach(() => {
  try {
    localStorage.clear()
  } catch {
    // ignore
  }
  useStore.getState().__resetForTest?.()
})

afterEach(() => {
  useStore.getState().selectRoom(null)
  vi.restoreAllMocks()
})

describe('ShowroomRow', () => {
  it('renders a chip for every curated finish of the surface', () => {
    render(<ShowroomRow surface="floor" active="" onSelect={() => {}} />)
    for (const f of showroomFinishes('floor')) {
      expect(screen.getByRole('button', { name: `Showroom finish: ${f.name}` })).toBeTruthy()
    }
    // No wall finish leaks into the floor strip.
    for (const f of showroomFinishes('wall')) {
      expect(screen.queryByRole('button', { name: `Showroom finish: ${f.name}` })).toBeNull()
    }
  })

  it('tap → resolves the remote asset at the strip resolution, then applies the finish id', async () => {
    const resolveMock = vi.fn().mockResolvedValue(undefined)
    useStore.setState({ resolveRemoteAsset: resolveMock } as never)
    const onSelect = vi.fn()
    render(<ShowroomRow surface="floor" active="" onSelect={onSelect} />)

    const first = showroomFinishes('floor')[0]
    fireEvent.click(screen.getByRole('button', { name: `Showroom finish: ${first.name}` }))

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(showroomFinishId(first.slug)))
    expect(resolveMock).toHaveBeenCalledTimes(1)
    const [entry, res] = resolveMock.mock.calls[0]
    expect(entry.provider).toBe('polyhaven')
    expect(entry.slug).toBe(first.slug)
    expect(res).toBe(SHOWROOM_RESOLUTION)
  })

  it('applies immediately (no re-fetch) when the finish is already resolved', () => {
    const first = showroomFinishes('wall')[0]
    const id = showroomFinishId(first.slug)
    const resolveMock = vi.fn()
    useStore.setState({
      resolveRemoteAsset: resolveMock,
      resolvedRemoteMaterials: { [id]: { id } },
    } as never)
    const onSelect = vi.fn()
    render(<ShowroomRow surface="wall" active="" onSelect={onSelect} />)

    fireEvent.click(screen.getByRole('button', { name: `Showroom finish: ${first.name}` }))
    expect(onSelect).toHaveBeenCalledWith(id)
    expect(resolveMock).not.toHaveBeenCalled()
  })

  it('a failed resolve keeps the current finish (no onSelect) and toasts', async () => {
    const resolveMock = vi.fn().mockRejectedValue(new Error('offline'))
    useStore.setState({ resolveRemoteAsset: resolveMock } as never)
    const onSelect = vi.fn()
    render(<ShowroomRow surface="floor" active="" onSelect={onSelect} />)

    const first = showroomFinishes('floor')[0]
    fireEvent.click(screen.getByRole('button', { name: `Showroom finish: ${first.name}` }))

    await waitFor(() => expect(resolveMock).toHaveBeenCalled())
    expect(onSelect).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(
        useStore.getState().notifications.some((n) => n.title.includes("Couldn't download")),
      ).toBe(true),
    )
  })
})

describe('FinishPicker mounts the Showroom strip (flag + both modes)', () => {
  const strip = () => screen.queryByRole('group', { name: 'Showroom finishes' })

  it('shows in default Simple mode', () => {
    useStore.getState().selectRoom(ROOM)
    render(<FinishPicker />)
    expect(strip()).toBeTruthy()
  })

  it('shows in Pro mode', () => {
    useStore.getState().setUiMode('pro')
    useStore.getState().reresolveFeatureFlags()
    useStore.getState().selectRoom(ROOM)
    render(<FinishPicker />)
    expect(strip()).toBeTruthy()
  })

  it('hides when the showroomFinishes flag is off', () => {
    useStore.getState().setFeatureFlag('showroomFinishes', false)
    useStore.getState().selectRoom(ROOM)
    render(<FinishPicker />)
    expect(strip()).toBeNull()
  })
})
