import type { ProviderId } from '../types'

const KEY = (p: ProviderId) => `sofa-cache:index-pointer:${p}`

export interface ShadowPointer {
  count: number
  fetchedAt: string
}

export function writeShadow(p: ProviderId, ptr: ShadowPointer): void {
  try {
    localStorage.setItem(KEY(p), JSON.stringify(ptr))
  } catch {
    // ignore quota
  }
}
