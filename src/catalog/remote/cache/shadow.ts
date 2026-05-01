import type { ProviderId } from '../types';

const KEY = (p: ProviderId) => `sofa-cache:index-pointer:${p}`;

export interface ShadowPointer {
  count: number;
  fetchedAt: string;
}

export function readShadow(p: ProviderId): ShadowPointer | null {
  try {
    const raw = localStorage.getItem(KEY(p));
    return raw ? (JSON.parse(raw) as ShadowPointer) : null;
  } catch {
    return null;
  }
}

export function writeShadow(p: ProviderId, ptr: ShadowPointer): void {
  try {
    localStorage.setItem(KEY(p), JSON.stringify(ptr));
  } catch {
    // ignore quota
  }
}
