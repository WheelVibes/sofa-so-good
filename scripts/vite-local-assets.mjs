// Dev-only Vite plugin: serve GLB/GLTF files dropped into `local-assets/` so they
// load straight into the furniture catalog WITHOUT the browser upload pipeline
// (no convert/optimize/IndexedDB). Paired with the `localAssets` devOnly feature
// flag + `localAssetsSlice` on the app side. Intended for bulk datasets where the
// per-file upload/optimize cost is too slow.
//
// `apply: 'serve'` means this only exists on the dev server — a production
// (GitHub Pages) build never registers these routes, and there is no filesystem
// there anyway, so the catalog simply has no local entries in prod.
//
// Routes (mounted under /@local-assets):
//   GET /@local-assets/index.json        → [{ relPath, name, bytes, subdir }]
//   GET /@local-assets/file/<relPath>    → the raw file (path-traversal guarded)
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

const MOUNT = '/@local-assets'
const MODEL_EXT = new Set(['.glb', '.gltf'])
const MIME = {
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ktx2': 'image/ktx2',
}
// Guard against a runaway scan of a huge tree; bulk datasets are big but flat.
const MAX_DEPTH = 6
const MAX_FILES = 20000

/** Title-case a filename stem for a friendly catalog display name. */
function prettyName(stem) {
  return stem
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Recursively list model files under `root`, relative-pathed + POSIX slashes. */
async function scan(root) {
  const out = []
  async function walk(dir, depth) {
    if (depth > MAX_DEPTH || out.length >= MAX_FILES) return
    let entries
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (out.length >= MAX_FILES) return
      if (e.name.startsWith('.')) continue
      const abs = path.join(dir, e.name)
      if (e.isDirectory()) {
        await walk(abs, depth + 1)
      } else if (e.isFile() && MODEL_EXT.has(path.extname(e.name).toLowerCase())) {
        const rel = path.relative(root, abs).split(path.sep).join('/')
        const stem = e.name.replace(/\.[^.]+$/, '')
        // First path segment is treated as an optional category hint by the app.
        const subdir = rel.includes('/') ? rel.split('/')[0] : ''
        let bytes = 0
        try {
          bytes = (await fsp.stat(abs)).size
        } catch {}
        out.push({ relPath: rel, name: prettyName(stem), bytes, subdir })
      }
    }
  }
  await walk(root, 0)
  out.sort((a, b) => a.relPath.localeCompare(b.relPath))
  return out
}

function sendJson(res, status, body) {
  const json = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(json)
}

/**
 * @param {object} [opts]
 * @param {string} [opts.dir] folder name under the project root (default 'local-assets')
 */
export function localAssetsPlugin(opts = {}) {
  const folder = opts.dir ?? 'local-assets'
  let root = ''
  return {
    name: 'sofa-local-assets',
    apply: 'serve',
    configResolved(config) {
      root = path.resolve(config.root, folder)
    },
    configureServer(server) {
      // Ensure the folder exists so the first drop-in "just works".
      fs.mkdirSync(root, { recursive: true })
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? ''
        if (!url.startsWith(`${MOUNT}/`)) return next()
        const rest = url.slice(MOUNT.length + 1)
        const [routeRaw] = rest.split('?')

        if (routeRaw === 'index.json') {
          try {
            return sendJson(res, 200, { files: await scan(root) })
          } catch (e) {
            return sendJson(res, 500, { error: String(e) })
          }
        }

        if (routeRaw.startsWith('file/')) {
          const relRaw = decodeURIComponent(routeRaw.slice('file/'.length))
          const abs = path.resolve(root, relRaw)
          // Path-traversal guard: the resolved path must stay under root.
          if (abs !== root && !abs.startsWith(root + path.sep)) {
            res.statusCode = 403
            return res.end('forbidden')
          }
          let stat
          try {
            stat = await fsp.stat(abs)
          } catch {
            res.statusCode = 404
            return res.end('not found')
          }
          if (!stat.isFile()) {
            res.statusCode = 404
            return res.end('not found')
          }
          res.statusCode = 200
          res.setHeader(
            'Content-Type',
            MIME[path.extname(abs).toLowerCase()] ?? 'application/octet-stream',
          )
          res.setHeader('Content-Length', String(stat.size))
          res.setHeader('Cache-Control', 'no-store')
          fs.createReadStream(abs).pipe(res)
          return
        }

        return next()
      })
    },
  }
}
