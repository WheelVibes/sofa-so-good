import { describe, expect, it } from 'vitest'
import { MIGRATIONS, migrate, VersionMismatchError } from './migrations'

describe('migrate', () => {
  it('migrates a v1 payload (no longer current) up to v2', () => {
    const payload = { version: 1, items: [] }
    const out = migrate(payload) as { version: number }
    expect(out.version).toBe(2)
  })

  it('migrates a v1 payload to v2, leaving items untouched (groupId optional)', () => {
    const v1 = {
      version: 1,
      items: [{ id: 'a', defId: 'dining-chair', position: [0, 0], rotation: 0, props: {} }],
    }
    const out = migrate(v1) as { version: number; items: unknown[] }
    expect(out.version).toBe(2)
    expect(out.items).toEqual(v1.items) // no groupId added; absent = ungrouped
  })

  it('passes through a v2 payload unchanged', () => {
    const payload = { version: 2, items: [] }
    expect(migrate(payload)).toBe(payload)
  })

  it('walks a registered v0 migration up the chain to current', () => {
    MIGRATIONS[0] = (raw) => {
      const r = raw as Record<string, unknown>
      return { ...r, version: 1, addedField: 'default' }
    }
    try {
      const out = migrate({ version: 0 }) as Record<string, unknown>
      expect(out.version).toBe(2) // 0 -> 1 (stub) -> 2 (real)
      expect(out.addedField).toBe('default')
    } finally {
      delete MIGRATIONS[0]
    }
  })

  it('throws VersionMismatchError on an unknown predecessor', () => {
    expect(() => migrate({ version: 0 })).toThrow(VersionMismatchError)
  })

  it('throws on a future version', () => {
    expect(() => migrate({ version: 99 })).toThrow(VersionMismatchError)
  })
})
