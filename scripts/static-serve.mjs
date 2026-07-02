// Minimal static server that serves dist/ under a base path the way a static
// host (GitHub Pages project site) does: real files at <base>/<path>, and a
// navigation-only fallback to index.html. Unlike `vite preview` in this sandbox
// it honours the base for asset requests, so offline/SW behaviour matches prod.

import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'

const ROOT = new URL('../dist/', import.meta.url).pathname
// Override for builds made with a different VITE_BASE (e.g. BASE=/ for the
// Docker image's root-path build). Must start and end with `/`.
const BASE = process.env.BASE || '/sofa-so-good/'
const PORT = Number(process.env.PORT || 4173)

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.glb': 'model/gltf-binary',
  '.ktx2': 'image/ktx2',
}

async function tryFile(p) {
  try {
    const s = await stat(p)
    if (s.isFile()) return await readFile(p)
  } catch {}
  return null
}

createServer(async (req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0])
  if (!urlPath.startsWith(BASE)) {
    if (urlPath === '/' || urlPath === BASE.slice(0, -1)) {
      res.writeHead(302, { Location: BASE })
      return res.end()
    }
    res.writeHead(404)
    return res.end('not found')
  }
  let rel = urlPath.slice(BASE.length)
  if (rel === '' || rel.endsWith('/')) rel += 'index.html'
  const safe = normalize(rel).replace(/^(\.\.[/\\])+/, '')
  const file = join(ROOT, safe)
  let body = await tryFile(file)
  // Navigation fallback (Accept: text/html) → index.html, like a SPA host.
  if (!body && (req.headers.accept || '').includes('text/html')) {
    body = await tryFile(join(ROOT, 'index.html'))
    if (body) {
      res.writeHead(200, { 'content-type': 'text/html' })
      return res.end(body)
    }
  }
  if (!body) {
    res.writeHead(404)
    return res.end('not found')
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' })
  res.end(body)
}).listen(PORT, () => console.log(`static-serve: http://localhost:${PORT}${BASE}`))
