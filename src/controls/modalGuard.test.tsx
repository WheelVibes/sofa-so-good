// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isAnyModalOpen, registerOpenModal, resetModalGuardForTests } from './modalGuard'
import { useKeyboard } from './useKeyboard'

const press = (code: string, target?: EventTarget) => {
  const evt = new KeyboardEvent('keydown', { code, key: code, bubbles: true })
  ;(target ?? window).dispatchEvent(evt)
}

beforeEach(() => {
  resetModalGuardForTests()
  document.body.innerHTML = ''
})

describe('modalGuard counter', () => {
  it('tracks open modals and releases idempotently', () => {
    expect(isAnyModalOpen()).toBe(false)
    const releaseA = registerOpenModal()
    const releaseB = registerOpenModal()
    expect(isAnyModalOpen()).toBe(true)
    releaseA()
    expect(isAnyModalOpen()).toBe(true) // B still open
    releaseB()
    expect(isAnyModalOpen()).toBe(false)
    // Double-release must not push the counter negative (a later modal
    // would otherwise be ignored).
    releaseB()
    const releaseC = registerOpenModal()
    expect(isAnyModalOpen()).toBe(true)
    releaseC()
    expect(isAnyModalOpen()).toBe(false)
  })
})

describe('useKeyboard modal + input gating', () => {
  it('fires normally with no modal open, no-ops while one is open, resumes after close', () => {
    const handler = vi.fn()
    renderHook(() => useKeyboard(handler))

    press('KeyP')
    expect(handler).toHaveBeenCalledTimes(1)

    const release = registerOpenModal()
    press('KeyP')
    press('KeyZ')
    press('Escape')
    expect(handler).toHaveBeenCalledTimes(1) // all suppressed while modal open

    release()
    press('KeyP')
    expect(handler).toHaveBeenCalledTimes(2) // works again after close
  })

  it('ignores keystrokes targeting an input / textarea / contenteditable', () => {
    const handler = vi.fn()
    renderHook(() => useKeyboard(handler))

    const input = document.createElement('input')
    const textarea = document.createElement('textarea')
    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    document.body.append(input, textarea, editable)

    press('KeyP', input)
    press('KeyP', textarea)
    press('KeyP', editable)
    expect(handler).not.toHaveBeenCalled()

    press('KeyP') // plain window target still fires
    expect(handler).toHaveBeenCalledTimes(1)
  })
})
