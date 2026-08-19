// @vitest-environment happy-dom
/**
 * UIUX-14: the plan editor's boolean display toggles show their armed state
 * with the sanctioned `.btn.on` toggle grammar (accent-soft fill + selection
 * ring), NOT the `btn-accent` CTA fill — accent fill means "primary action",
 * not "currently on" (TB-8 / DESIGN.md interaction grammar).
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PlanViewMenuActions } from './PlanViewMenuActions'

const base = {
  fPlanLabels: true,
  labelsOn: false,
  planLabels: 'off' as const,
  onCycleLabels: () => {},
  showRoomLabels: false,
  onToggleRoomLabels: () => {},
  showWallDims: false,
  onToggleWallDims: () => {},
  showFurniture: false,
  onToggleFurniture: () => {},
  fMep: true,
  showMep: false,
  onToggleMep: () => {},
  fHackability: true,
  showHackability: false,
  onToggleHackability: () => {},
  skeleton: false,
  onToggleSkeleton: () => {},
  isMultiLevel: true,
  showOtherLevels: false,
  onToggleOtherLevels: () => {},
  onExportPng: () => {},
}

describe('PlanViewMenuActions toggle grammar (UIUX-14)', () => {
  it('an ON toggle carries .on (never btn-accent) and aria-pressed', () => {
    render(<PlanViewMenuActions {...base} showFurniture skeleton />)
    for (const label of ['Furniture', 'Skeleton']) {
      const b = screen.getByText(label)
      expect(b.className).toContain('on')
      expect(b.className).not.toContain('btn-accent')
      expect(b.getAttribute('aria-pressed')).toBe('true')
    }
  })

  it('an OFF toggle has neither state class, and Export PNG is a plain action', () => {
    render(<PlanViewMenuActions {...base} />)
    for (const label of ['Furniture', 'Skeleton', 'Dims', 'MEP', 'Hackability', 'All levels']) {
      const b = screen.getByText(label)
      expect(b.className).toBe('btn btn-sm')
    }
    expect(screen.getByText('Export PNG').className).toBe('btn btn-sm')
  })
})
