// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from '../../features/flags/registry'
import { resolveFlags } from '../../features/flags/resolve'
import { CatalogResizeHandle } from './CatalogResizeHandle'

const rootVar = () => document.documentElement.style.getPropertyValue('--catalog-w')

describe('catalogResize flag (both modes)', () => {
  it('is a simple-tier feature present in BOTH Simple and Pro', () => {
    expect(FEATURE_FLAGS.catalogResize.tier).toBe('simple')
    expect(resolveFlags(false, {}, false, 'simple').catalogResize).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').catalogResize).toBe(true)
  })
})

describe('CatalogResizeHandle', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.style.removeProperty('--catalog-w')
  })
  afterEach(() => localStorage.clear())

  it('restores the persisted width on mount (clamped)', () => {
    localStorage.setItem('hdb_catalog_width', '420')
    render(<CatalogResizeHandle />)
    expect(rootVar()).toBe('420px')
  })

  it('drag updates --catalog-w live and clamps to the [260, 560] range', () => {
    render(<CatalogResizeHandle />)
    const handle = screen.getByRole('button', { name: /Resize catalog panel/i })
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 320 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 480 })
    expect(rootVar()).toBe('480px')
    // Beyond the max clamps to 560; below the min clamps to 260.
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 9999 })
    expect(rootVar()).toBe('560px')
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 10 })
    expect(rootVar()).toBe('260px')
    // Release persists the final width.
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 10 })
    expect(localStorage.getItem('hdb_catalog_width')).toBe('260')
  })

  it('ignores a foreign pointer id mid-drag', () => {
    render(<CatalogResizeHandle />)
    const handle = screen.getByRole('button', { name: /Resize catalog panel/i })
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 320 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 400 })
    expect(rootVar()).toBe('400px')
    fireEvent.pointerMove(handle, { pointerId: 2, clientX: 520 }) // other finger — no-op
    expect(rootVar()).toBe('400px')
  })

  it('arrow keys nudge the width by 16px and persist', () => {
    localStorage.setItem('hdb_catalog_width', '400')
    render(<CatalogResizeHandle />)
    const handle = screen.getByRole('button', { name: /Resize catalog panel/i })
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(rootVar()).toBe('416px')
    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(rootVar()).toBe('400px')
    expect(localStorage.getItem('hdb_catalog_width')).toBe('400')
  })
})
