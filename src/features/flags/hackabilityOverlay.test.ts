// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { PlanViewMenuActions } from '../../ui/floorplan/editor/PlanViewMenuActions'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * R4-7: flag gating for the live wall-hackability overlay in the 2D plan editor
 * — tints each wall by its demolition-permit status (red = not permitted,
 * amber = permit required, muted = unclassified). A specialised demolition-
 * planning surface beyond the core furnish loop → pro tier, hidden in Simple
 * (the default experience). Tested in BOTH modes per the CLAUDE.md hard rule.
 */
describe('hackabilityOverlay feature flag', () => {
  it('is registered as a pro-tier feature, default on', () => {
    const def = FEATURE_FLAGS.hackabilityOverlay
    expect(def).toBeDefined()
    expect(def.tier).toBe('pro')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'pro').hackabilityOverlay).toBe(true)
  })

  it('is forced OFF in Simple mode (default experience)', () => {
    expect(resolveFlags(false, {}, false, 'simple').hackabilityOverlay).toBe(false)
  })
})

describe('hackabilityOverlay View-menu toggle gating', () => {
  afterEach(cleanup)

  const renderMenu = (fHackability: boolean) =>
    render(
      createElement(PlanViewMenuActions, {
        fPlanLabels: false,
        labelsOn: false,
        planLabels: 'off',
        onCycleLabels: () => {},
        showRoomLabels: false,
        onToggleRoomLabels: () => {},
        showWallDims: false,
        onToggleWallDims: () => {},
        showFurniture: false,
        onToggleFurniture: () => {},
        fMep: false,
        showMep: false,
        onToggleMep: () => {},
        fHackability,
        showHackability: false,
        onToggleHackability: () => {},
        skeleton: false,
        onToggleSkeleton: () => {},
        isMultiLevel: false,
        showOtherLevels: false,
        onToggleOtherLevels: () => {},
        onExportPng: () => {},
      }),
    )

  it('shows the Hackability toggle in Pro (flag on)', () => {
    renderMenu(resolveFlags(false, {}, false, 'pro').hackabilityOverlay)
    expect(screen.queryByRole('button', { name: /Hackability/i })).not.toBe(null)
  })

  it('hides the Hackability toggle in Simple (flag off)', () => {
    renderMenu(resolveFlags(false, {}, false, 'simple').hackabilityOverlay)
    expect(screen.queryByRole('button', { name: /Hackability/i })).toBe(null)
  })
})
