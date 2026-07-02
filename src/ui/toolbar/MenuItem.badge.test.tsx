/**
 * "New" feature badge (P27) on `MenuItem` — the representative wired entry is
 * the "Style quiz" row in the Tools menu (`ToolsMenu.tsx`, `newFlag="styleQuiz"`),
 * a real `pro`-tier flag with a `NEW_BADGES` entry (`src/ui/newBadges.ts`).
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../../state/store'
import { NEW_BADGES } from '../newBadges'
import { MenuItem } from './ToolbarMenu'

// `styleQuiz` was introduced at 0.9.0.6 — pin "now" inside its recency window
// (same 0.9.0 patch line) so the mechanics are deterministic regardless of the
// live `APP_VERSION`, which naturally moves on and ages this real entry out.
vi.mock('../../version', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../version')>()
  return { ...actual, APP_VERSION: '0.9.0.20' }
})

function setFlags(patch: Partial<Record<string, boolean>>) {
  useStore.setState({
    featureFlags: { ...useStore.getState().featureFlags, ...patch } as never,
  })
}

beforeEach(() => {
  useStore.getState().__resetForTest?.()
  // Recent + on + on + unseen — the "should show" baseline for every test.
  setFlags({ newBadges: true, styleQuiz: true })
})

describe('MenuItem newFlag badge', () => {
  it('is registered against a real NEW_BADGES entry', () => {
    expect(NEW_BADGES.styleQuiz).toBeDefined()
  })

  it('shows the dot when newBadges is on, the target flag is on, and it is unseen', () => {
    render(<MenuItem icon="Palette" label="Style quiz" newFlag="styleQuiz" onClick={() => {}} />)
    expect(document.querySelector('.new-dot')).not.toBeNull()
  })

  it('marks the badge seen on click, and the dot is gone on re-render', () => {
    const { rerender } = render(
      <MenuItem icon="Palette" label="Style quiz" newFlag="styleQuiz" onClick={() => {}} />,
    )
    expect(document.querySelector('.new-dot')).not.toBeNull()
    fireEvent.click(screen.getByRole('menuitem'))
    expect(useStore.getState().seenBadges).toContain('styleQuiz')
    rerender(<MenuItem icon="Palette" label="Style quiz" newFlag="styleQuiz" onClick={() => {}} />)
    expect(document.querySelector('.new-dot')).toBeNull()
  })

  it('still runs the row onClick when marking the badge seen', () => {
    let clicked = false
    render(
      <MenuItem
        icon="Palette"
        label="Style quiz"
        newFlag="styleQuiz"
        onClick={() => {
          clicked = true
        }}
      />,
    )
    fireEvent.click(screen.getByRole('menuitem'))
    expect(clicked).toBe(true)
  })

  it('shows no dot when the newBadges flag itself is off', () => {
    setFlags({ newBadges: false })
    render(<MenuItem icon="Palette" label="Style quiz" newFlag="styleQuiz" onClick={() => {}} />)
    expect(document.querySelector('.new-dot')).toBeNull()
  })

  it('shows no dot when the target flag is off (e.g. a pro flag forced off in Simple)', () => {
    setFlags({ styleQuiz: false })
    render(<MenuItem icon="Palette" label="Style quiz" newFlag="styleQuiz" onClick={() => {}} />)
    expect(document.querySelector('.new-dot')).toBeNull()
  })

  it('shows no dot for a row with no newFlag at all', () => {
    render(<MenuItem icon="Palette" label="Plain row" onClick={() => {}} />)
    expect(document.querySelector('.new-dot')).toBeNull()
  })
})
