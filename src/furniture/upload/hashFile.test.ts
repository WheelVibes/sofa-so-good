import { describe, expect, it } from 'vitest'
import { hashFile } from './hashFile'

describe('hashFile', () => {
  it('returns a stable hex SHA-256 for identical bytes', async () => {
    const a = new File([new Uint8Array([1, 2, 3, 4])], 'a.glb')
    const b = new File([new Uint8Array([1, 2, 3, 4])], 'different-name.glb')
    const ha = await hashFile(a)
    const hb = await hashFile(b)
    expect(ha).toBe(hb) // content, not name
    expect(ha).toMatch(/^[0-9a-f]{64}$/)
  })

  it('differs for different bytes', async () => {
    const a = new File([new Uint8Array([1, 2, 3, 4])], 'a.glb')
    const c = new File([new Uint8Array([1, 2, 3, 5])], 'a.glb')
    expect(await hashFile(a)).not.toBe(await hashFile(c))
  })
})
