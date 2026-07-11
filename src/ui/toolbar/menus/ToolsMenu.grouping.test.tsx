// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveFlags, setResolvedFlags } from '../../../features/featureFlags'
import { useStore } from '../../../state/store'
import { ToolsMenu } from './ToolsMenu'

/** TB-5: the Tools menu holds analysis panels/modes ONLY — its old
 *  "Export & document" section (~17 rows) moved to the File menu, and the
 *  Budget row moved into File's "Budget & costs" group. */
const COST_OVERRIDES = { budget: true, shopExport: true, boq: true } as const

function setMode(mode: 'simple' | 'pro') {
  const flags = resolveFlags(true, COST_OVERRIDES, false, mode)
  setResolvedFlags(flags)
  useStore.setState({ featureFlags: flags, uiMode: mode })
}

function openToolsMenu() {
  render(<ToolsMenu />)
  fireEvent.click(screen.getByRole('button', { name: 'Tools' }))
}

beforeEach(() => {
  useStore.getState().__resetForTest()
  localStorage.clear()
})
afterEach(() => {
  setResolvedFlags(resolveFlags(true))
  localStorage.clear()
})

describe('ToolsMenu — analysis panels/modes only (Pro mode)', () => {
  beforeEach(() => setMode('pro'))

  it('has no "Export & document" section and no export rows', () => {
    openToolsMenu()
    expect(screen.queryByText('Export & document')).toBeNull()
    for (const label of [
      'Report',
      'Moodboard',
      'Quote (BOQ)',
      'Quote → Excel (.xlsx)',
      'Export DXF (CAD)',
      'Export SVG (plan)',
      'Export 3D model (.glb)',
      'Drawing set',
      'Reno timeline (.ics)',
      'Share & export',
      'View in your room (AR)',
    ]) {
      expect(screen.queryByText(label)).toBeNull()
    }
  })

  it('no longer carries the Budget row (moved to File → Budget & costs)', () => {
    openToolsMenu()
    expect(screen.queryByText('Budget')).toBeNull()
  })

  it('keeps the analysis/mode sections: Analyse, Review & tour, Style', () => {
    openToolsMenu()
    expect(screen.getByText('Analyse')).toBeTruthy()
    expect(screen.getByText('Review & tour')).toBeTruthy()
    expect(screen.getByText('Style')).toBeTruthy()
    // Panel/mode rows stay (default-on flags; `clearanceChecks` defaults off).
    expect(screen.getByText('Measure distance')).toBeTruthy()
    expect(screen.getByText('Sheet callouts')).toBeTruthy()
    expect(screen.getByText('Sun study')).toBeTruthy()
    expect(screen.getByText('Style quiz')).toBeTruthy()
    expect(screen.getByText('Style transfer')).toBeTruthy()
  })
})

describe('ToolsMenu — Simple mode', () => {
  beforeEach(() => setMode('simple'))

  it('hides the pro-tier Style + annotation rows', () => {
    openToolsMenu()
    // styleQuiz / styleTransfer / drawingCallouts / sunStudy are pro-tier.
    expect(screen.queryByText('Style')).toBeNull()
    expect(screen.queryByText('Style quiz')).toBeNull()
    expect(screen.queryByText('Style transfer')).toBeNull()
    expect(screen.queryByText('Sheet callouts')).toBeNull()
    expect(screen.queryByText('Sun study')).toBeNull()
    // Simple-tier analysis modes stay reachable.
    expect(screen.getByText('Measure distance')).toBeTruthy()
  })
})
