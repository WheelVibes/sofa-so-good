// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PlanToolsSheet } from './PlanToolsSheet'

/** TB-6-tail: the plan editor's mobile menu uses the SAME icon-rail sheet
 *  paradigm as the main mobile toolbar (`MobileSheet`), not the old bespoke
 *  centered "Plan tools" modal. These tests pin the structure: rail tabs,
 *  master-detail section switching, the conditional Edit section, and the
 *  shell's Escape-to-close a11y contract. */

const frag = (label: string) => <button type="button">{label}</button>

function renderSheet(over: Partial<Parameters<typeof PlanToolsSheet>[0]> = {}) {
  const onClose = vi.fn()
  const onHelp = vi.fn()
  render(
    <PlanToolsSheet
      open
      onClose={onClose}
      planName="My flat"
      onPlanNameChange={() => {}}
      templateLibrary={frag('Templates')}
      fileActions={frag('New')}
      viewMenuActions={frag('Labels')}
      gridZoom={frag('Zoom in')}
      wallTypeSeg={frag('Internal')}
      multiSelectToggle={frag('Multi-select')}
      planDefaults={frag('Ceiling height')}
      totalLabel={<span>Total 90 m²</span>}
      onHelp={onHelp}
      {...over}
    />,
  )
  return { onClose, onHelp }
}

describe('PlanToolsSheet — icon-rail sheet paradigm', () => {
  it('renders the MobileSheet shell: overlay, rail tablist, sheet title', () => {
    renderSheet()
    expect(document.querySelector('.m-menu-overlay')).toBeTruthy()
    expect(document.querySelector('.m-sheet')).toBeTruthy()
    expect(document.querySelector('.m-sheet-grab')).toBeTruthy()
    expect(screen.getByRole('tablist', { name: 'Menu sections' })).toBeTruthy()
    expect(screen.getByText('Plan tools')).toBeTruthy()
    // No centered-modal remnants (the old bespoke paradigm).
    expect(document.querySelector('.modal-overlay')).toBeNull()
    expect(document.querySelector('.plan-tools-sheet')).toBeNull()
  })

  it('shows Plan/View/Edit/Defaults rail tabs and defaults to Plan', () => {
    renderSheet()
    const tabs = screen.getAllByRole('tab').map((t) => t.getAttribute('aria-label'))
    expect(tabs).toEqual(['Plan', 'View', 'Edit', 'Defaults'])
    // Plan section body is visible: plan-name input + templates/file fragments.
    expect(screen.getByLabelText('Plan name')).toBeTruthy()
    expect((screen.getByLabelText('Plan name') as HTMLInputElement).value).toBe('My flat')
    expect(screen.getByText('Templates')).toBeTruthy()
    expect(screen.getByText('New')).toBeTruthy()
    // Other sections' bodies are not mounted (master-detail).
    expect(screen.queryByText('Labels')).toBeNull()
    expect(screen.queryByText('Ceiling height')).toBeNull()
  })

  it('switches sections from the rail (master-detail)', () => {
    renderSheet()
    fireEvent.click(screen.getByRole('tab', { name: 'View' }))
    expect(screen.getByText('Labels')).toBeTruthy()
    expect(screen.getByText('Zoom in')).toBeTruthy()
    expect(screen.queryByLabelText('Plan name')).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: 'Edit' }))
    expect(screen.getByText('Internal')).toBeTruthy()
    expect(screen.getByText('Multi-select')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Defaults' }))
    expect(screen.getByText('Ceiling height')).toBeTruthy()
    expect(screen.getByText('Total 90 m²')).toBeTruthy()
  })

  it('hides the Edit rail tab when neither edit control is present', () => {
    renderSheet({ wallTypeSeg: null, multiSelectToggle: null })
    const tabs = screen.getAllByRole('tab').map((t) => t.getAttribute('aria-label'))
    expect(tabs).toEqual(['Plan', 'View', 'Defaults'])
  })

  it('keeps every plan action reachable: help lives under Defaults', () => {
    const { onHelp } = renderSheet()
    fireEvent.click(screen.getByRole('tab', { name: 'Defaults' }))
    fireEvent.click(screen.getByRole('button', { name: /Help — user guide/ }))
    expect(onHelp).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape (shared MobileSheet a11y contract)', () => {
    const { onClose } = renderSheet()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders nothing while closed', () => {
    renderSheet({ open: false })
    expect(document.querySelector('.m-menu-overlay')).toBeNull()
  })
})
