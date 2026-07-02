/**
 * Cloudflare Turnstile verification for the login form. When no secret is
 * configured (local/preview) verification is skipped so dev isn't blocked.
 */
import type { Env } from './env'

export async function verifyTurnstile(
  env: Env,
  token: string | null,
  ip: string | null,
): Promise<boolean> {
  if (!env.TURNSTILE_SECRET) return true // not configured — skip (dev/preview)
  if (!token) return false
  const body = new FormData()
  body.append('secret', env.TURNSTILE_SECRET)
  body.append('response', token)
  if (ip) body.append('remoteip', ip)
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
    })
    const data = (await res.json()) as { success?: boolean }
    return data.success === true
  } catch {
    return false
  }
}
