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
