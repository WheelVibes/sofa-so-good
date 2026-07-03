// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../state/store'
import { HistoryPanel } from './HistoryPanel'

function seedTwoSteps() {
  const s = useStore.getState()
  s.addItem({ defId: 'sofa-3seat', position: [1, 1], rotation: 0, props: {} })
  s.addItem({ defId: 'bed-double', position: [2, 2], rotation: 0, props: {} })
}

beforeEach(() => {
  useStore.getState().__resetForTest?.()
  useStore.getState().setHistoryOpen(true)
})

describe('HistoryPanel search', () => {
  it('renders no search field when there are no steps yet', () => {
    render(<HistoryPanel />)
    expect(screen.queryByPlaceholderText(/filter/i)).toBeNull()
  })

  it('shows a search field once steps exist and filters rows by label', () => {
    seedTwoSteps()
    render(<HistoryPanel />)

    expect(screen.getByText(/added 3-seat sofa/i)).toBeInTheDocument()
    expect(screen.getByText(/added double bed/i)).toBeInTheDocument()

    const field = screen.getByPlaceholderText(/filter 2 steps/i)
    fireEvent.change(field, { target: { value: 'sofa' } })

    expect(screen.getByText(/added 3-seat sofa/i)).toBeInTheDocument()
    expect(screen.queryByText(/added double bed/i)).toBeNull()
  })

  it('shows an EmptyState with a Clear filter CTA when nothing matches, which resets the input', () => {
    seedTwoSteps()
    render(<HistoryPanel />)

    const field = screen.getByPlaceholderText(/filter 2 steps/i)
    fireEvent.change(field, { target: { value: 'nomatch-xyz' } })

    expect(screen.queryByText(/added 3-seat sofa/i)).toBeNull()
    const clearBtn = screen.getByRole('button', { name: /clear filter/i })
    expect(clearBtn).toBeInTheDocument()

    fireEvent.click(clearBtn)

    expect((field as HTMLInputElement).value).toBe('')
    expect(screen.getByText(/added 3-seat sofa/i)).toBeInTheDocument()
  })
})
