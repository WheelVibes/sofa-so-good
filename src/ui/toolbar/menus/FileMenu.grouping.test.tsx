// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveFlags, setResolvedFlags } from '../../../features/featureFlags'
import { useStore } from '../../../state/store'
import { FileMenu } from './FileMenu'

/** TB-5 (toolbar UX audit P1-5/6): every one-shot export/document action lives
 *  in the FILE menu, grouped under section headers, and the four scattered cost
 *  surfaces (Budget panel, Shopping list, Quote/BOQ, Cost breakdown) sit
 *  together under one "Budget & costs" group. Cost flags default off (not
 *  production-ready), so tests turn them on via overrides — the Simple leg then
 *  proves the pro-TIER rows still drop out (tier gating beats an override). */
const COST_OVERRIDES = { budget: true, shopExport: true, boq: true } as const

function setMode(mode: 'simple' | 'pro') {
  const flags = resolveFlags(true, COST_OVERRIDES, false, mode)
  setResolvedFlags(flags)
  useStore.setState({ featureFlags: flags, uiMode: mode })
}

function openFileMenu() {
  render(<FileMenu />)
  fireEvent.click(screen.getByRole('button', { name: 'File' }))
}

beforeEach(() => {
  useStore.getState().__resetForTest()
  localStorage.clear()
})
afterEach(() => {
  setResolvedFlags(resolveFlags(true))
  localStorage.clear()
})

describe('FileMenu grouping — Pro mode', () => {
  beforeEach(() => setMode('pro'))

  it('shows the grouped section headers', () => {
    openFileMenu()
    for (const label of [
      'Save & capture',
      'Share & document',
      'Budget & costs',
      // The export heading enumerates only the buckets that actually render
      // (UIUX-71). This leg turns `shopExport` on via COST_OVERRIDES and Pro
      // keeps the CAD rows, so all three buckets are present here.
      'CAD, 3D & data',
      'Load & reset',
    ]) {
      expect(screen.getByText(label)).toBeTruthy()
    }
  })

  it('offers the geometry-only professional formats (pro tier, UIUX-71)', () => {
    openFileMenu()
    expect(screen.getByText('Export 3D model (.obj)')).toBeTruthy()
    expect(screen.getByText('Export 3D model (.stl)')).toBeTruthy()
  })

  it('groups the four cost surfaces under one menu (TB-5)', () => {
    openFileMenu()
    expect(screen.getByText('Budget')).toBeTruthy()
    expect(screen.getByText('Shopping list')).toBeTruthy()
    expect(screen.getByText('Quote (BOQ)')).toBeTruthy()
    expect(screen.getByText('Quote → Excel (.xlsx)')).toBeTruthy()
    expect(screen.getByText('Cost breakdown (CSV)')).toBeTruthy()
  })

  it('carries the export & document rows that moved from Tools', () => {
    openFileMenu()
    for (const label of [
      'Moodboard',
      'Report',
      'Reno timeline (.ics)',
      'Drawing set',
      'Export DXF (CAD)',
      'Export SVG (plan)',
      'Export 3D model (.glb)',
      'Export for AR (.usdz)',
      'View in your room (AR)',
      'Share & export',
    ]) {
      expect(screen.getByText(label)).toBeTruthy()
    }
  })

  it('the Budget row toggles the budget aux panel via the shared registry action', () => {
    openFileMenu()
    expect(useStore.getState().budgetOpen).toBe(false)
    fireEvent.click(screen.getByText('Budget'))
    expect(useStore.getState().budgetOpen).toBe(true)
  })
})

describe('FileMenu grouping — Simple mode (pro-tier rows hidden)', () => {
  beforeEach(() => setMode('simple'))

  it('keeps the simple-tier cost + share rows', () => {
    openFileMenu()
    // budget / shopExport / sceneExport3d / shareExport are simple-tier.
    expect(screen.getByText('Budget')).toBeTruthy()
    expect(screen.getByText('Shopping list')).toBeTruthy()
    expect(screen.getByText('Cost breakdown (CSV)')).toBeTruthy()
    expect(screen.getByText('Budget & costs')).toBeTruthy()
    expect(screen.getByText('Export 3D model (.glb)')).toBeTruthy()
    // Consumer-facing AR format stays in Simple (UIUX-71) — "see it in your room".
    expect(screen.getByText('Export for AR (.usdz)')).toBeTruthy()
    expect(screen.getByText('Share & export')).toBeTruthy()
  })

  it('drops "CAD" from the export heading when the CAD rows are gated off (UIUX-71)', () => {
    openFileMenu()
    // DXF/SVG are pro-tier, so Simple shows only 3D + data rows — a fixed
    // "CAD, 3D & data" heading used to promise an absent category.
    expect(screen.getByText('3D & data')).toBeTruthy()
    expect(screen.queryByText('CAD, 3D & data')).toBeNull()
  })

  it('drops the pro-tier rows even with the cost overrides on', () => {
    openFileMenu()
    for (const label of [
      'Quote (BOQ)',
      'Quote → Excel (.xlsx)',
      'Quote template',
      'Report',
      'Moodboard',
      'Drawing set',
      'Reno timeline (.ics)',
      'Export DXF (CAD)',
      'View in your room (AR)',
      // Geometry-only professional formats — pro tier since UIUX-71.
      'Export 3D model (.obj)',
      'Export 3D model (.stl)',
    ]) {
      expect(screen.queryByText(label)).toBeNull()
    }
  })
})
