// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveFlags, setResolvedFlags } from '../../../features/featureFlags'
import { useStore } from '../../../state/store'
import { FileSection } from './FileSection'
import { ToolsSection } from './ToolsSection'

/** TB-5, mobile mirror: the sheet's File section owns every output (grouped
 *  under the same subheaders as desktop, incl. the "Budget & costs" cluster);
 *  the Tools section keeps analysis panels/modes only. */
const COST_OVERRIDES = { budget: true, shopExport: true, boq: true } as const

function setMode(mode: 'simple' | 'pro') {
  const flags = resolveFlags(true, COST_OVERRIDES, false, mode)
  setResolvedFlags(flags)
  useStore.setState({ featureFlags: flags, uiMode: mode })
}

const act = (fn: () => void) => fn

function renderFileSection() {
  render(<FileSection activeId="file" act={act} slots={[]} refreshSlots={() => {}} />)
}
function renderToolsSection() {
  render(<ToolsSection activeId="tools" act={act} sunStudy={false} setSunStudy={() => {}} />)
}

beforeEach(() => {
  useStore.getState().__resetForTest()
  localStorage.clear()
})
afterEach(() => {
  setResolvedFlags(resolveFlags(true))
  localStorage.clear()
})

describe('mobile FileSection grouping — Pro mode', () => {
  beforeEach(() => setMode('pro'))

  it('shows the grouped subheaders mirroring desktop', () => {
    renderFileSection()
    for (const label of [
      'Save & capture',
      'Share & document',
      'Budget & costs',
      'CAD, 3D & data',
      'Load & reset',
    ]) {
      expect(screen.getByText(label)).toBeTruthy()
    }
  })

  it('groups the cost surfaces under Budget & costs (TB-5)', () => {
    renderFileSection()
    expect(screen.getByText('Budget')).toBeTruthy()
    expect(screen.getByText('Shopping list')).toBeTruthy()
    expect(screen.getByText('Quote (BOQ)')).toBeTruthy()
    expect(screen.getByText('Cost breakdown (CSV)')).toBeTruthy()
  })

  it('carries the rows that moved from the Tools section', () => {
    renderFileSection()
    for (const label of ['Share & export', 'Report', 'Reno timeline (.ics)', 'Export SVG (plan)']) {
      expect(screen.getByText(label)).toBeTruthy()
    }
  })

  it('Tools section keeps analysis/modes only — no export rows, no Budget', () => {
    renderToolsSection()
    expect(screen.queryByText('Export & document')).toBeNull()
    for (const label of [
      'Budget',
      'Share & export',
      'Report',
      'Reno timeline (.ics)',
      'Export SVG (plan)',
    ]) {
      expect(screen.queryByText(label)).toBeNull()
    }
    expect(screen.getByText('Analyse')).toBeTruthy()
    expect(screen.getByText('Style quiz')).toBeTruthy()
  })
})

describe('mobile FileSection grouping — Simple mode (pro-tier rows hidden)', () => {
  beforeEach(() => setMode('simple'))

  it('keeps simple-tier rows and drops pro-tier ones', () => {
    renderFileSection()
    expect(screen.getByText('Budget & costs')).toBeTruthy()
    expect(screen.getByText('Budget')).toBeTruthy()
    expect(screen.getByText('Shopping list')).toBeTruthy()
    expect(screen.getByText('Cost breakdown (CSV)')).toBeTruthy()
    expect(screen.getByText('Share & export')).toBeTruthy()
    // Pro-tier rows drop even with the cost overrides on.
    for (const label of ['Quote (BOQ)', 'Report', 'Reno timeline (.ics)', 'Export SVG (plan)']) {
      expect(screen.queryByText(label)).toBeNull()
    }
  })
})
