import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveFlags, setResolvedFlags } from '../../features/featureFlags'
import { useStore } from '../store'

vi.mock('../../features/api/client', async (orig) => {
  const real = (await orig()) as Record<string, unknown>
  return { ...real, hasBackend: () => true }
})

const fetchIndex = vi.fn()
const registerGroup = vi.fn()
vi.mock('../../catalog/packs/sharedLibrary', () => ({
  fetchSharedLibraryIndex: () => fetchIndex(),
  registerSharedGroup: (g: string) => registerGroup(g),
}))

const item = {
  group: 'alex',
  groupKey: 'alex',
  name: 'ALEX',
  type: 'Desk',
  category: 'desk',
  size: '',
  series: 'ALEX',
  variants: 1,
  thumbnail: 'a.jpg',
  price: 199,
  currency: 'SGD',
}

describe('sharedLibrarySlice', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
    fetchIndex.mockReset()
    registerGroup.mockReset()
    setResolvedFlags(resolveFlags(false, {}, false, 'pro')) // sharedLibrary on
    useStore.setState({
      currentUser: { id: 'u1', email: 'a@b.c', name: 'A', role: 'admin' },
    } as never)
  })

  it('bootstrap is a no-op when signed out', async () => {
    useStore.setState({ currentUser: null } as never)
    await useStore.getState().bootstrapSharedLibrary()
    expect(fetchIndex).not.toHaveBeenCalled()
    expect(useStore.getState().sharedLibrary.status).toBe('idle')
  })

  it('bootstrap is a no-op for a signed-in non-admin user', async () => {
    useStore.setState({
      currentUser: { id: 'u2', email: 'u@b.c', name: 'U', role: 'user' },
    } as never)
    await useStore.getState().bootstrapSharedLibrary()
    expect(fetchIndex).not.toHaveBeenCalled()
    expect(useStore.getState().sharedLibrary.status).toBe('idle')
  })

  it('bootstrap runs for an admin in Simple mode (simple-tier flag stays on)', async () => {
    setResolvedFlags(resolveFlags(false, {}, false, 'simple'))
    fetchIndex.mockResolvedValue({ version: 1, generatedAt: '', count: 1, items: [item] })
    await useStore.getState().bootstrapSharedLibrary()
    expect(useStore.getState().sharedLibrary.status).toBe('ready')
  })

  it('bootstrap is a no-op when the flag is overridden off', async () => {
    setResolvedFlags(resolveFlags(true, { sharedLibrary: false }, false, 'pro'))
    await useStore.getState().bootstrapSharedLibrary()
    expect(fetchIndex).not.toHaveBeenCalled()
  })

  it('loads the index → ready', async () => {
    fetchIndex.mockResolvedValue({ version: 1, generatedAt: '', count: 1, items: [item] })
    await useStore.getState().bootstrapSharedLibrary()
    expect(useStore.getState().sharedLibrary.status).toBe('ready')
    expect(useStore.getState().sharedLibrary.items).toHaveLength(1)
  })

  it('sets error when the fetch yields nothing', async () => {
    fetchIndex.mockResolvedValue(null)
    await useStore.getState().bootstrapSharedLibrary()
    expect(useStore.getState().sharedLibrary.status).toBe('error')
  })

  it('does not refetch once loaded', async () => {
    fetchIndex.mockResolvedValue({ version: 1, generatedAt: '', count: 0, items: [] })
    await useStore.getState().bootstrapSharedLibrary()
    await useStore.getState().bootstrapSharedLibrary()
    expect(fetchIndex).toHaveBeenCalledTimes(1)
  })

  it('addSharedGroup returns the def id on success', async () => {
    registerGroup.mockResolvedValue(true)
    fetchIndex.mockResolvedValue({ version: 1, generatedAt: '', count: 1, items: [item] })
    await useStore.getState().bootstrapSharedLibrary()
    const id = await useStore.getState().addSharedGroup('alex')
    expect(id).toBe('ikea-alex')
    expect(registerGroup).toHaveBeenCalledWith('alex')
  })

  it('addSharedGroup returns null and flags error on failure', async () => {
    registerGroup.mockResolvedValue(false)
    fetchIndex.mockResolvedValue({ version: 1, generatedAt: '', count: 1, items: [item] })
    await useStore.getState().bootstrapSharedLibrary()
    const id = await useStore.getState().addSharedGroup('alex')
    expect(id).toBeNull()
    expect(useStore.getState().sharedLibrary.resolving.alex).toBe('error')
  })
})
