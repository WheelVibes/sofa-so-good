/**
 * Unit tests for the first-run boot-decision logic.
 *
 * The decision is intentionally pure (injectable deps) so we can test all
 * localStorage states and migration cases without touching the real store or
 * mounting any React components.
 */

import { describe, expect, it } from 'vitest'
import { resolveBootDecision } from './bootDecision'

// ---------------------------------------------------------------------------
// Clean-profile cases
// ---------------------------------------------------------------------------
describe('resolveBootDecision — clean profile', () => {
  it('shows the carousel when nothing is set (brand-new user)', () => {
    expect(resolveBootDecision({ onboarded: false })).toBe('carousel')
  })

  it('shows the carousel when hdb_tour_done is set but hdb_onboarded is not (migration: old tour-first path)', () => {
    // The user was on the old codebase that started the tour first; they have
    // hdb_tour_done='1' but never saw the onboarding carousel. They must see
    // the carousel — the boot decision reads only hdb_onboarded, so this maps
    // to the same code path as a clean profile.
    expect(resolveBootDecision({ onboarded: false })).toBe('carousel')
  })
})

// ---------------------------------------------------------------------------
// Returning-user cases
// ---------------------------------------------------------------------------
describe('resolveBootDecision — returning user', () => {
  it('shows nothing when hdb_onboarded is set (fully returning user)', () => {
    expect(resolveBootDecision({ onboarded: true })).toBe('nothing')
  })

  it('shows nothing when hdb_onboarded is set regardless of hdb_tour_done', () => {
    // Migration: user onboarded in the new flow; even if hdb_tour_done is also
    // set (they took the tour) they must not re-see either surface.
    expect(resolveBootDecision({ onboarded: true })).toBe('nothing')
  })
})

// ---------------------------------------------------------------------------
// Tour is NOT auto-fired — the carousel is the only auto surface
// ---------------------------------------------------------------------------
describe('resolveBootDecision — tour not auto-fired', () => {
  it('never returns a value that would auto-start the tour', () => {
    // This explicitly documents the contract: the tour is only started by the
    // user choosing it inside the carousel, never by the boot decision itself.
    const cleanResult = resolveBootDecision({ onboarded: false })
    expect(cleanResult).not.toBe('tour' as unknown)

    const returningResult = resolveBootDecision({ onboarded: true })
    expect(returningResult).not.toBe('tour' as unknown)
  })
})

// ---------------------------------------------------------------------------
// Migration edge cases (both flags set / only one set)
// ---------------------------------------------------------------------------
describe('resolveBootDecision — migration cases', () => {
  it('migration A: onboarded=true, tour unseen — no surprise re-onboarding', () => {
    // User went through onboarding on the new code but didn't take the tour.
    // hdb_onboarded='1', hdb_tour_done unset.
    // The boot decision reads only hdb_onboarded → 'nothing'.
    expect(resolveBootDecision({ onboarded: true })).toBe('nothing')
  })

  it('migration B: tour seen (old flow), onboarded=false — carousel fires', () => {
    // Old code set hdb_tour_done='1' on the first run but never set
    // hdb_onboarded. When the user visits with the new code their
    // hdb_onboarded is still unset → carousel must fire so they complete the
    // new first-run flow. Once they dismiss the carousel markOnboarded() sets
    // hdb_onboarded='1' and future visits hit 'nothing'.
    expect(resolveBootDecision({ onboarded: false })).toBe('carousel')
  })
})
