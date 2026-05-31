import { fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { describe, expect, it } from 'vitest'
import { Popover } from './Popover'

function Harness({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  return (
    <div>
      <button ref={ref}>trigger</button>
      <Popover open={open} anchorRef={ref} onClose={onClose}>
        <div>panel-body</div>
      </Popover>
    </div>
  )
}

describe('Popover', () => {
  it('renders children only when open', () => {
    const { rerender } = render(<Harness open={false} onClose={() => {}} />)
    expect(screen.queryByText('panel-body')).toBeNull()
    rerender(<Harness open onClose={() => {}} />)
    expect(screen.getByText('panel-body')).toBeTruthy()
  })

  it('calls onClose on Escape', () => {
    let closed = false
    render(
      <Harness
        open
        onClose={() => {
          closed = true
        }}
      />,
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(closed).toBe(true)
  })

  it('calls onClose on outside pointerdown', () => {
    let closed = false
    render(
      <Harness
        open
        onClose={() => {
          closed = true
        }}
      />,
    )
    fireEvent.pointerDown(document.body)
    expect(closed).toBe(true)
  })
})
