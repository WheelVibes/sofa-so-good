/**
 * Cloud sync for favourites (furniture + finish). Best-effort: failures never
 * block the local, per-device favourites which remain the source of truth
 * offline. Only used when a backend is configured and the user is signed in.
 */
import { apiFetch } from './api/client'

export type FavouriteKind = 'furniture' | 'finish'

export interface CloudFavourites {
  furniture: string[]
  finish: string[]
}

export async function fetchCloudFavourites(): Promise<CloudFavourites | null> {
  try {
    return await apiFetch<CloudFavourites>('/favourites')
  } catch {
    return null
  }
}

export async function pushFavourite(kind: FavouriteKind, defId: string): Promise<void> {
  try {
    await apiFetch(`/favourites/${kind}/${encodeURIComponent(defId)}`, { method: 'PUT' })
  } catch {
    /* best-effort */
  }
}

export async function removeCloudFavourite(kind: FavouriteKind, defId: string): Promise<void> {
  try {
    await apiFetch(`/favourites/${kind}/${encodeURIComponent(defId)}`, { method: 'DELETE' })
  } catch {
    /* best-effort */
  }
}
