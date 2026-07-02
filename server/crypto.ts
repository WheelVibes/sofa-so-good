/**
 * Password hashing + token generation using WebCrypto (available in Workers).
 *
 * PBKDF2-HMAC-SHA256 is used because argon2/scrypt aren't available natively in
 * the Workers runtime. Iterations are tunable (PBKDF2_ITERATIONS) to stay under
 * the free-tier 10 ms CPU/request budget — measure and lower if login errors.
 */

const encoder = new TextEncoder()

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ''
  for (const b of view) binary += String.fromCharCode(b)
  return btoa(binary)
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    256,
  )
  return toBase64(bits)
}

export interface PasswordHash {
  hash: string
  salt: string
  iterations: number
}

export async function hashPassword(password: string, iterations: number): Promise<PasswordHash> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await deriveKey(password, salt, iterations)
  return { hash, salt: toBase64(salt), iterations }
}

/** Constant-time-ish comparison of two base64 strings of equal length. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function verifyPassword(
  password: string,
  stored: PasswordHash,
): Promise<boolean> {
  const candidate = await deriveKey(password, fromBase64(stored.salt), stored.iterations)
  return safeEqual(candidate, stored.hash)
}

/** Opaque, URL-safe random session token. */
export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function uuid(): string {
  return crypto.randomUUID()
}
