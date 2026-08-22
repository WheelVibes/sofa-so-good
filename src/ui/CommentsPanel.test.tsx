// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../state/store'
import { CommentsPanel } from './CommentsPanel'

describe('CommentsPanel empty state', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  it('shows the shared EmptyState when there are no comments', () => {
    useStore.getState().setCommentsOpen(true)
    const { container } = render(<CommentsPanel />)
    // Shared empty-state shell + friendly copy.
    expect(container.querySelector('.empty-mini')).toBeTruthy()
    expect(screen.getByText('No comments yet')).toBeInTheDocument()
  })

  it('wires the empty-state CTA to arm comment mode', () => {
    useStore.getState().setCommentsOpen(true)
    render(<CommentsPanel />)
    expect(useStore.getState().commentMode).toBe(false)
    // The empty-state CTA mirrors the panel's "+ Add comment" action.
    const ctas = screen.getAllByRole('button', { name: '+ Add comment' })
    fireEvent.click(ctas[ctas.length - 1])
    expect(useStore.getState().commentMode).toBe(true)
  })
})

/**
 * UIUX-80: comment delete was the one delete in the app with neither a confirm
 * prompt nor an Undo toast, on a trash icon 6px from the edit icon in a
 * three-button row. `deleteComment` does push history, but nothing said so.
 */
describe('CommentsPanel delete', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  const seed = () => {
    const s = useStore.getState()
    s.addComment({ position: [1, 1], text: 'Sofa too close to the TV wall' })
    s.setCommentsOpen(true)
  }

  it('raises a danger confirm and keeps the comment while it is open', () => {
    seed()
    render(<CommentsPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete comment 1' }))
    // The prompt is a store request; the comment survives until it resolves.
    expect(useStore.getState().confirmRequest?.danger).toBe(true)
    expect(useStore.getState().confirmRequest?.title).toBe('Delete comment?')
    expect(useStore.getState().comments).toHaveLength(1)
  })

  it('deletes only after the prompt is confirmed', async () => {
    seed()
    render(<CommentsPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete comment 1' }))
    useStore.getState().resolveConfirm(true)
    // The handler awaits the promise, so let the microtask queue drain.
    await Promise.resolve()
    await Promise.resolve()
    expect(useStore.getState().comments).toHaveLength(0)
  })

  it('keeps the comment when the prompt is dismissed', async () => {
    seed()
    render(<CommentsPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete comment 1' }))
    useStore.getState().resolveConfirm(false)
    await Promise.resolve()
    await Promise.resolve()
    expect(useStore.getState().comments).toHaveLength(1)
  })

  it('gives every row action a real icon, not a bare glyph', () => {
    seed()
    const { container } = render(<CommentsPanel />)
    const row = container.querySelector('.cmt-row')
    const actions = [...(row?.querySelectorAll('.icon-btn') ?? [])]
    expect(actions).toHaveLength(3)
    for (const b of actions) {
      expect(b.querySelector('svg'), b.getAttribute('aria-label') ?? '').toBeTruthy()
      // The ✓ / ✎ text glyphs these replaced left no stray characters behind.
      expect(b.textContent?.trim()).toBe('')
    }
  })

  it('marks a resolved row with the class the stylesheet keys off', () => {
    seed()
    const id = useStore.getState().comments[0].id
    useStore.getState().setCommentResolved(id, true)
    const { container } = render(<CommentsPanel />)
    expect(container.querySelector('.cmt-row.resolved')).toBeTruthy()
    expect(container.querySelector('.cmt-row .icon-btn.on')).toBeTruthy()
  })
})
