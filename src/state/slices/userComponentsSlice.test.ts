// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { serializeComponentFragment } from '../../furniture/glbEdit/componentFragment'
import type { ShapePart } from '../../furniture/glbEdit/editSpec'
import { useStore } from '../store'
import type { UserComponent } from './userComponentsSlice'

function leg(id: string): ShapePart {
  return { id, kind: 'box', position: [0, 0.2, 0], size: [0.05, 0.4, 0.05], color: '#5a4632' }
}

function component(id: string, name = 'My leg'): UserComponent {
  return {
    id,
    name,
    fragment: serializeComponentFragment({ parts: [leg('a'), leg('b')] }),
    createdAt: Date.now(),
  }
}

describe('userComponentsSlice (Stage 9b)', () => {
  beforeEach(() => {
    localStorage.clear()
    useStore.getState().setUserComponents([])
  })

  it('saves a component and persists it to localStorage', () => {
    expect(useStore.getState().addUserComponent(component('uc-1'))).toBe(true)
    expect(useStore.getState().userComponents.map((c) => c.id)).toEqual(['uc-1'])
    const raw = JSON.parse(localStorage.getItem('hdb_user_components') as string)
    expect(raw).toHaveLength(1)
    expect(raw[0].id).toBe('uc-1')
  })

  it('newest-first ordering; re-save by id replaces', () => {
    useStore.getState().addUserComponent(component('uc-1', 'first'))
    useStore.getState().addUserComponent(component('uc-2', 'second'))
    expect(useStore.getState().userComponents.map((c) => c.id)).toEqual(['uc-2', 'uc-1'])
    // Replace uc-1 by id.
    useStore.getState().addUserComponent(component('uc-1', 'renamed'))
    const list = useStore.getState().userComponents
    expect(list).toHaveLength(2)
    expect(list.find((c) => c.id === 'uc-1')?.name).toBe('renamed')
  })

  it('removes a component', () => {
    useStore.getState().addUserComponent(component('uc-1'))
    useStore.getState().removeUserComponent('uc-1')
    expect(useStore.getState().userComponents).toHaveLength(0)
    expect(localStorage.getItem('hdb_user_components')).toBeNull()
  })

  it('rejects a record whose fragment does not parse', () => {
    const bad = { id: 'uc-x', name: 'bad', fragment: 'not an envelope', createdAt: Date.now() }
    expect(useStore.getState().addUserComponent(bad as UserComponent)).toBe(false)
    expect(useStore.getState().userComponents).toHaveLength(0)
  })

  it('FAILS LOUD (returns false, no state commit) when the write throws', () => {
    const spy = vi.spyOn(globalThis.localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    try {
      expect(useStore.getState().addUserComponent(component('uc-1'))).toBe(false)
      expect(useStore.getState().userComponents).toHaveLength(0)
    } finally {
      spy.mockRestore()
    }
  })

  it('drops corrupt records on load (setUserComponents filters)', () => {
    useStore
      .getState()
      .setUserComponents([
        component('uc-1'),
        { id: 'uc-2', name: 'x', fragment: 'garbage', createdAt: 1 } as UserComponent,
      ])
    expect(useStore.getState().userComponents.map((c) => c.id)).toEqual(['uc-1'])
  })
})
