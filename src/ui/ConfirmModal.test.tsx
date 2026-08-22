// @vitest-environment happy-dom
/**
 * UIUX-5: ConfirmModal's actions render through Modal's `footer` prop on the
 * shared `.panel-foot` row (not inline in the scrollable body), keep the
 * safe-default focus on Cancel, and keep Enter-confirms.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetModalGuardForTests } from '../controls/modalGuard'
import { useStore } from '../state/store'
import { ConfirmModal } from './ConfirmModal'

beforeEach(() => {
  useStore.getState().__resetForTest()
  resetModalGuardForTests()
})
afterEach(() => {
  cleanup()
  resetModalGuardForTests()
})

function openConfirm(danger = true) {
  const promise = useStore.getState().confirmAction({
    title: 'Delete this layout?',
    message: 'It will be permanently deleted.',
    confirmLabel: 'Delete layout',
    danger,
  })
  return promise
}

describe('ConfirmModal footer + focus (UIUX-5)', () => {
  it('renders both actions inside a .panel-foot footer row, outside .panel-body', async () => {
    render(<ConfirmModal />)
    void openConfirm()
    await waitFor(() => expect(screen.getByText('Delete layout')).toBeTruthy())
    const foot = document.querySelector('.panel-foot')
    expect(foot).not.toBeNull()
    expect(foot!.textContent).toContain('Cancel')
    expect(foot!.textContent).toContain('Delete layout')
    expect(document.querySelector('.panel-body .btn')).toBeNull()
  })

  it('focuses Cancel by default and uses the danger variant for the confirm', async () => {
    render(<ConfirmModal />)
    void openConfirm(true)
    await waitFor(() => expect(screen.getByText('Delete layout')).toBeTruthy())
    await waitFor(() => expect(document.activeElement?.textContent).toBe('Cancel'))
    expect(screen.getByText('Delete layout').className).toContain('btn-danger')
  })

  it('resolves true on confirm click', async () => {
    render(<ConfirmModal />)
    const p = openConfirm()
    await waitFor(() => expect(screen.getByText('Delete layout')).toBeTruthy())
    screen.getByText('Delete layout').click()
    await expect(p).resolves.toBe(true)
  })
})
