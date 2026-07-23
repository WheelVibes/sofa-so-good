import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetContextRestore,
  bumpContextRestore,
  contextRestoreVersion,
  subscribeContextRestore,
} from './contextRestoreSignal'

/** GPU-STARVE-2 — the context-restore rebuild signal. */
describe('contextRestoreSignal', () => {
  beforeEach(() => __resetContextRestore())

  it('bumps the version and notifies subscribers', () => {
    let notified = 0
    const unsub = subscribeContextRestore(() => notified++)
    expect(contextRestoreVersion()).toBe(0)
    bumpContextRestore()
    expect(contextRestoreVersion()).toBe(1)
    expect(notified).toBe(1)
    unsub()
    bumpContextRestore()
    expect(contextRestoreVersion()).toBe(2)
    expect(notified).toBe(1)
  })
})
