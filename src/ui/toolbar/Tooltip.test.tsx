import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Tooltip } from './Tooltip'

describe('Tooltip', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('shows label + shortcut chip after hover delay', () => {
    render(
      <Tooltip label="Catalog" shortcut="C">
        <button>btn</button>
      </Tooltip>,
    )
    fireEvent.pointerEnter(screen.getByText('btn').parentElement!)
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(screen.getByText('Catalog')).toBeTruthy()
    expect(screen.getByTestId('tooltip-chip').textContent).toBe('C')
  })

  it('omits the chip when there is no shortcut', () => {
    render(
      <Tooltip label="Credits" shortcut="">
        <button>btn</button>
      </Tooltip>,
    )
    fireEvent.pointerEnter(screen.getByText('btn').parentElement!)
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(screen.getByText('Credits')).toBeTruthy()
    expect(screen.queryByTestId('tooltip-chip')).toBeNull()
  })

  it('hides on pointer leave before the delay elapses', () => {
    render(
      <Tooltip label="Catalog" shortcut="C">
        <button>btn</button>
      </Tooltip>,
    )
    const wrap = screen.getByText('btn').parentElement!
    fireEvent.pointerEnter(wrap)
    fireEvent.pointerLeave(wrap)
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(screen.queryByText('Catalog')).toBeNull()
  })
})
