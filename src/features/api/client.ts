/**
 * Thin client for the Cloudflare Pages Function API (`/api/*`). The backend is
 * only present on the Cloudflare deployment; the GitHub Pages / offline build
 * leaves `VITE_API_BASE` unset, so `hasBackend()` is false and the app stays
 * fully guest/local — no login, no cloud sync. Set `VITE_API_BASE=/api` for the
 * same-origin Cloudflare build (or a full origin for a cross-origin API).
 */

const RAW_BASE = (import.meta.env?.VITE_API_BASE as string | undefined)?.trim() ?? ''
/** Normalised API base with no trailing slash (e.g. `/api`). Empty = no backend. */
export const API_BASE = RAW_BASE.replace(/\/$/, '')

/** Is a real backend configured for this build? */
export function hasBackend(): boolean {
  return API_BASE !== ''
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** Fetch JSON from the API. Always sends cookies (session). Throws ApiError. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init.body && !(init.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...init.headers,
    },
  })
  let data: unknown = null
  const text = await res.text()
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  if (!res.ok) {
    const message =
      (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : undefined) ?? `Request failed (${res.status}).`
    throw new ApiError(res.status, message)
  }
  return data as T
}

/** URL for a shared-library asset served through the auth-gated proxy. */
export function assetUrl(key: string): string {
  return `${API_BASE}/assets/${key}`
}
