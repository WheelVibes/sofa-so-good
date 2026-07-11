// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveFlags, setResolvedFlags } from '../../../features/featureFlags'
import { useStore } from '../../../state/store'
import { ArrangeMenu } from './ArrangeMenu'
import { FileMenu } from './FileMenu'
import { ToolsMenu } from './ToolsMenu'
import { ViewMenu } from './ViewMenu'

/** TB-9: ONE section-header idiom across the desktop menus — every group
 *  header renders through the shared `MenuLabel` primitive (`.menu-label`),
 *  never a hand-rolled uppercase div (the old ViewMenu/ArrangeMenu styles). */

function setMode(mode: 'simple' | 'pro') {
  const flags = resolveFlags(true, {}, false, mode)
  setResolvedFlags(flags)
  useStore.setState({ featureFlags: flags, uiMode: mode })
}

function openMenu(el: React.ReactElement, name: string) {
  render(el)
  fireEvent.click(screen.getByRole('button', { name }))
}

beforeEach(() => {
  useStore.getState().__resetForTest()
  localStorage.clear()
  setMode('pro')
})
afterEach(() => {
  cleanup()
  setResolvedFlags(resolveFlags(true))
  localStorage.clear()
})

const MENUS: [string, () => React.ReactElement][] = [
  ['File', () => <FileMenu />],
  ['Tools', () => <ToolsMenu />],
  ['View', () => <ViewMenu />],
  ['Arrange', () => <ArrangeMenu />],
]

describe('menu section headers use the shared MenuLabel primitive (TB-9)', () => {
  for (const [name, make] of MENUS) {
    it(`${name} menu renders .menu-label headers and no hand-rolled uppercase header`, () => {
      openMenu(make(), name)
      expect(document.querySelectorAll('.menu-label').length).toBeGreaterThan(0)
      // The old hand-rolled idioms styled headers inline with Tailwind
      // `uppercase tracking-wider` utilities — none may remain.
      expect(document.querySelector('[class*="tracking-wider"]')).toBeNull()
    })
  }

  it('ViewMenu section labels come through MenuLabel', () => {
    openMenu(<ViewMenu />, 'View')
    const labels = [...document.querySelectorAll('.menu-label')].map((n) => n.textContent)
    expect(labels).toContain('Camera')
    expect(labels).toContain('Framing')
  })

  it('ArrangeMenu group headers come through MenuLabel', () => {
    openMenu(<ArrangeMenu />, 'Arrange')
    const labels = [...document.querySelectorAll('.menu-label')].map((n) => n.textContent)
    for (const l of ['Drop a set', 'My sets', 'Apply a preset', 'Apply a style', 'My styles']) {
      expect(labels).toContain(l)
    }
  })
})

describe('ArrangeMenu shared primitives (TB-9)', () => {
  it('quick actions are shared MenuItem rows', () => {
    openMenu(<ArrangeMenu />, 'Arrange')
    const items = [...document.querySelectorAll('.menu-item')].map(
      (n) => n.querySelector('.mi-main')?.textContent,
    )
    expect(items).toContain('Tidy home')
    expect(items).toContain('Save current style…')
  })

  it('empty saved sets/styles render the shared EmptyState', () => {
    openMenu(<ArrangeMenu />, 'Arrange')
    const empties = [...document.querySelectorAll('.empty-mini b')].map((n) => n.textContent)
    expect(empties).toContain('No saved sets yet')
    expect(empties).toContain('No saved styles yet')
  })
})
