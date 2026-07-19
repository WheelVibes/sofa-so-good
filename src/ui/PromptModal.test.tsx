// @vitest-environment happy-dom
/**
 * Tests for `PromptModal`, the themed replacement for `window.prompt`.
 * Regression focus (v0.22.2.29): a numeric prompt's input must carry
 * `step="any"` — without it a bare `type=number` defaults to `step=1`, so a
 * decimal answer (scale calibration metres, clip-length seconds) fails native
 * stepMismatch validation and the `<form>`'s submit silently no-ops.
 */
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../state/store'
import { PromptModal } from './PromptModal'

beforeEach(() => {
  useStore.getState().__resetForTest?.()
})
afterEach(() => {
  // Resolve any open prompt so its promise doesn't dangle between tests.
  useStore.getState().resolvePrompt?.(null)
})

describe('PromptModal', () => {
  it('is not rendered when there is no active prompt', () => {
    const { container } = render(<PromptModal />)
    expect(container.querySelector('#promptModal')).toBeNull()
  })

  it('a numeric prompt accepts a decimal value (step="any", not stepMismatch)', () => {
    void useStore.getState().promptText({ title: 'Real length', label: 'metres', numeric: true })
    render(<PromptModal />)
    const input = screen.getByLabelText('metres') as HTMLInputElement
    expect(input.type).toBe('number')
    expect(input.getAttribute('step')).toBe('any')
    // The concrete regression: a decimal must be a VALID value (no stepMismatch),
    // so the form can actually submit it.
    input.value = '3.05'
    expect(input.validity.stepMismatch).toBe(false)
    expect(input.checkValidity()).toBe(true)
  })

  it('a text prompt has no numeric step attribute', () => {
    void useStore.getState().promptText({ title: 'Name', label: 'name' })
    render(<PromptModal />)
    const input = screen.getByLabelText('name') as HTMLInputElement
    expect(input.type).toBe('text')
    expect(input.getAttribute('step')).toBeNull()
  })

  it('submitting resolves with the trimmed decimal value', async () => {
    const p = useStore.getState().promptText({ title: 'Len', label: 'm', numeric: true })
    render(<PromptModal />)
    const input = screen.getByLabelText('m') as HTMLInputElement
    // Drive the controlled input through React's onChange via the native value
    // setter (a bare `input.value=` assignment isn't seen by React).
    const setValue = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set
    setValue?.call(input, '2.4')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    screen.getByRole('button', { name: 'OK' }).click()
    await expect(p).resolves.toBe('2.4')
  })
})
