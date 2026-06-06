import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

describe('promptSlice', () => {
  beforeEach(() => useStore.setState({ textPrompt: null }))

  it('opens a request and resolves with the submitted value', async () => {
    const p = useStore.getState().promptText({ title: 'Save layout' })
    expect(useStore.getState().textPrompt?.title).toBe('Save layout')
    useStore.getState().resolvePrompt('Living room')
    await expect(p).resolves.toBe('Living room')
    expect(useStore.getState().textPrompt).toBeNull()
  })

  it('resolves null on cancel', async () => {
    const p = useStore.getState().promptText({ title: 'Name' })
    useStore.getState().resolvePrompt(null)
    await expect(p).resolves.toBeNull()
  })

  it('a superseding prompt cancels the prior one (resolves null)', async () => {
    const first = useStore.getState().promptText({ title: 'First' })
    const second = useStore.getState().promptText({ title: 'Second' })
    await expect(first).resolves.toBeNull()
    expect(useStore.getState().textPrompt?.title).toBe('Second')
    useStore.getState().resolvePrompt('done')
    await expect(second).resolves.toBe('done')
  })
})
