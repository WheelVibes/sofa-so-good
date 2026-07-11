// @vitest-environment happy-dom
/**
 * "New" feature badge (P27) on the mobile `Item` (`toolbar/mobile/parts.tsx`)
 * — the mobile-sheet mirror of `MenuItem.badge.test.tsx` (desktop). The
 * representative wired entry is the "Parallel projection" row in the mobile
 * View section (`toolbar/mobile/ViewSection.tsx`, `newFlag="parallelProjection"`),
 * a real `pro`-tier flag with a `NEW_BADGES` entry (`src/ui/newBadges.ts`).
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../../../state/store'
import { NEW_BADGES } from '../../newBadges'
import { Item } from './parts'

// `parallelProjection` was introduced at 0.20.0.6 — pin "now" inside its
// recency window (same 0.20.0 patch line) so the mechanics are deterministic
// regardless of the live `APP_VERSION`, which has since moved past it.
vi.mock('../../../version', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../version')>()
  return { ...actual, APP_VERSION: '0.20.0.20' }
})

function setFlags(patch: Partial<Record<string, boolean>>) {
  useStore.setState({
    featureFlags: { ...useStore.getState().featureFlags, ...patch } as never,
  })
}

beforeEach(() => {
  useStore.getState().__resetForTest?.()
  // Recent + on + on + unseen — the "should show" baseline for every test.
  setFlags({ newBadges: true, parallelProjection: true })
})

describe('mobile Item newFlag badge', () => {
  it('is registered against a real NEW_BADGES entry', () => {
    expect(NEW_BADGES.parallelProjection).toBeDefined()
  })

  it('shows the dot when newBadges is on, the target flag is on, and it is unseen', () => {
    render(
      <Item
        icon="Cube"
        label="Parallel projection"
        newFlag="parallelProjection"
        onClick={() => {}}
      />,
    )
    expect(document.querySelector('.new-dot')).not.toBeNull()
  })

  it('marks the badge seen on click, and the dot is gone on re-render', () => {
    const { rerender } = render(
      <Item
        icon="Cube"
        label="Parallel projection"
        newFlag="parallelProjection"
        onClick={() => {}}
      />,
    )
    expect(document.querySelector('.new-dot')).not.toBeNull()
    fireEvent.click(screen.getByText('Parallel projection'))
    expect(useStore.getState().seenBadges).toContain('parallelProjection')
    rerender(
      <Item
        icon="Cube"
        label="Parallel projection"
        newFlag="parallelProjection"
        onClick={() => {}}
      />,
    )
    expect(document.querySelector('.new-dot')).toBeNull()
  })

  it('still runs the row onClick when marking the badge seen', () => {
    let clicked = false
    render(
      <Item
        icon="Cube"
        label="Parallel projection"
        newFlag="parallelProjection"
        onClick={() => {
          clicked = true
        }}
      />,
    )
    fireEvent.click(screen.getByText('Parallel projection'))
    expect(clicked).toBe(true)
  })

  it('shows no dot when the newBadges flag itself is off', () => {
    setFlags({ newBadges: false })
    render(
      <Item
        icon="Cube"
        label="Parallel projection"
        newFlag="parallelProjection"
        onClick={() => {}}
      />,
    )
    expect(document.querySelector('.new-dot')).toBeNull()
  })

  it('shows no dot when the target flag is off (e.g. a pro flag forced off in Simple)', () => {
    setFlags({ parallelProjection: false })
    render(
      <Item
        icon="Cube"
        label="Parallel projection"
        newFlag="parallelProjection"
        onClick={() => {}}
      />,
    )
    expect(document.querySelector('.new-dot')).toBeNull()
  })

  it('shows no dot for a row with no newFlag at all', () => {
    render(<Item icon="Cube" label="Plain row" onClick={() => {}} />)
    expect(document.querySelector('.new-dot')).toBeNull()
  })
})
