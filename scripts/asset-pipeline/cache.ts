import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

/**
 * Returns a deterministic path under `cacheRoot` for a given source URL.
 * Layout: <cacheRoot>/<sha256(url).slice(0,16)>/<basename(url)>
 */
export function cachePathFor(cacheRoot: string, url: string): string {
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 16)
  const name = basename(new URL(url).pathname) || 'asset.bin'
  return join(cacheRoot, hash, name)
}

export async function downloadToCache(cacheRoot: string, url: string): Promise<string> {
  const path = cachePathFor(cacheRoot, url)
  if (existsSync(path)) return path

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Download failed: ${url} (${res.status})`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, buf)
  return path
}
