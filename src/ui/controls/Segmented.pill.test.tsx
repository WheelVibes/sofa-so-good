// @vitest-environment happy-dom
/**
 * UIUX-20: the Segmented sliding pill must never replace the indicator it
 * cannot draw — in a non-layout DOM (offsetWidth 0, as here) the component
 * stays in the static `.on` fallback: no `.slide` class, no `.seg-pill`,
 * selection still marked by `.on` + aria-checked.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Segmented } from './Segmented'

const OPTIONS = [
  { value: 'a', label: 'A' },
  { value: 'b', label: 'B' },
  { value: 'c', label: 'C' },
]

describe('Segmented sliding pill fallback (UIUX-20)', () => {
  it('keeps the static .on indicator when the pill cannot be measured', () => {
    const { container } = render(
      <Segmented value="b" onChange={() => {}} options={OPTIONS} ariaLabel="Test" />,
    )
    const group = container.querySelector('.seg')!
    expect(group.className).not.toContain('slide')
    expect(group.querySelector('.seg-pill')).toBeNull()
    const on = screen.getByRole('radio', { checked: true })
    expect(on.textContent).toBe('B')
    expect(on.className).toContain('on')
  })
})
