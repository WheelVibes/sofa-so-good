/**
 * Minimal S3/SigV4 client for the Cloudflare R2 asset bucket, shared by
 * `pull-r2-library.mjs` (download) and `push-r2-library.mjs` (upload).
 *
 * Hand-rolled rather than pulled from `@aws-sdk` or shelled out to `rclone`:
 * the surface we need is ListObjectsV2 + GET + PUT, and neither dependency is
 * installed in this repo. Credentials are resolved from the environment, a
 * `.r2.env` file, or an existing rclone remote (see `resolveCreds`).
 */

import { createHash, createHmac } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

// ------------------------------------------------------------- credentials

/** Read KEY=value lines from a dotenv file without clobbering the environment. */
export async function loadDotEnv(file) {
  let text
  try {
    text = await readFile(file, 'utf8')
  } catch {
    return
  }
  for (const line of text.split('\n')) {
    const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
    if (!m) continue
    const value = m[2].trim().replace(/^(['"])(.*)\1$/, '$2')
    if (process.env[m[1]] === undefined) process.env[m[1]] = value
  }
}

/**
 * Read one remote's key/value block out of an rclone config file. rclone stores
 * the R2 account id only inside the endpoint host, so callers derive it there.
 */
export function parseRcloneRemote(text, remote) {
  const section = new RegExp(`^\\[${remote}\\]\\s*$`, 'm').exec(text)
  if (!section) return null
  const body = text.slice(section.index + section[0].length).split(/^\[/m)[0]
  const out = {}
  for (const line of body.split('\n')) {
    const m = /^\s*([a-z0-9_]+)\s*=\s*(.*)$/i.exec(line)
    if (m) out[m[1].toLowerCase()] = m[2].trim()
  }
  return out
}

async function credsFromRclone(remote) {
  const file = process.env.RCLONE_CONFIG ?? path.join(homedir(), '.config', 'rclone', 'rclone.conf')
  let text
  try {
    text = await readFile(file, 'utf8')
  } catch {
    return null
  }
  const conf = parseRcloneRemote(text, remote)
  if (!conf?.access_key_id || !conf.secret_access_key) return null
  const accountId = /^https?:\/\/([0-9a-f]+)\.r2\.cloudflarestorage\.com/i.exec(
    conf.endpoint ?? '',
  )?.[1]
  if (!accountId) return null
  return {
    accountId,
    accessKeyId: conf.access_key_id,
    secretAccessKey: conf.secret_access_key,
    source: `rclone remote [${remote}] in ${file}`,
  }
}

/** Environment / `.r2.env` first, then the rclone remote. */
export async function resolveCreds(remote = 'sofa-r2') {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env
  if (R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY) {
    return {
      accountId: R2_ACCOUNT_ID,
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      source: 'R2_* environment variables (or .r2.env)',
    }
  }
  const rclone = await credsFromRclone(remote)
  if (rclone) return rclone
  throw new Error(
    'no R2 credentials -- set R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY ' +
      `(environment or .r2.env), or configure an rclone remote named "${remote}"`,
  )
}

// ------------------------------------------------------------------ sigv4

const REGION = 'auto'
const SERVICE = 's3'
const EMPTY_SHA256 = createHash('sha256').update('').digest('hex')

const hmac = (key, data) => createHmac('sha256', key).update(data).digest()
const sha256hex = (data) => createHash('sha256').update(data).digest('hex')

/** RFC3986 escaping — S3 canonical URIs keep `/` but escape everything else. */
export function uriEncode(str, encodeSlash) {
  let out = ''
  for (const ch of Buffer.from(str, 'utf8')) {
    const c = String.fromCharCode(ch)
    if (/[A-Za-z0-9\-._~]/.test(c)) out += c
    else if (c === '/') out += encodeSlash ? '%2F' : '/'
    else out += `%${ch.toString(16).toUpperCase().padStart(2, '0')}`
  }
  return out
}

/**
 * Sign a request and return the headers to send. `payloadSha256` is the hex
 * digest of the body (the empty-string digest for GET/LIST), and every entry of
 * `extraHeaders` is folded into the signature — a header that is signed but not
 * sent (or vice versa) is rejected by R2.
 */
export function sign({
  method,
  accessKeyId,
  secretAccessKey,
  host,
  canonicalUri,
  query,
  payloadSha256 = EMPTY_SHA256,
  extraHeaders = {},
  now = new Date(),
}) {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const canonicalQuery = [...query.entries()]
    .map(([k, v]) => [uriEncode(k, true), uriEncode(v, true)])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')

  const headers = {
    host,
    'x-amz-content-sha256': payloadSha256,
    'x-amz-date': amzDate,
    ...Object.fromEntries(Object.entries(extraHeaders).map(([k, v]) => [k.toLowerCase(), v])),
  }
  const names = Object.keys(headers).sort()
  const canonicalHeaders = `${names.map((n) => `${n}:${headers[n]}`).join('\n')}\n`
  const signedHeaders = names.join(';')

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadSha256,
  ].join('\n')
  const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n')
  let key = hmac(`AWS4${secretAccessKey}`, dateStamp)
  key = hmac(key, REGION)
  key = hmac(key, SERVICE)
  key = hmac(key, 'aws4_request')
  const signature = createHmac('sha256', key).update(stringToSign).digest('hex')
  return {
    ...extraHeaders,
    Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    'x-amz-content-sha256': payloadSha256,
    'x-amz-date': amzDate,
  }
}

const decodeXml = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')

// -------------------------------------------------------------------- client

/** Content type by extension, so R2 stores it and the proxy can echo it back. */
const CONTENT_TYPES = {
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  json: 'application/json',
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
  bin: 'application/octet-stream',
  ktx2: 'image/ktx2',
  hdr: 'image/vnd.radiance',
}

export function contentTypeFor(key) {
  return CONTENT_TYPES[key.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream'
}

export function makeClient({ accountId, accessKeyId, secretAccessKey, bucket }) {
  const host = `${accountId}.r2.cloudflarestorage.com`

  const request = async (method, canonicalUri, query, body, extraHeaders) => {
    const payloadSha256 = body ? sha256hex(body) : EMPTY_SHA256
    const headers = sign({
      method,
      accessKeyId,
      secretAccessKey,
      host,
      canonicalUri,
      query,
      payloadSha256,
      extraHeaders,
    })
    const url = `https://${host}${canonicalUri}${query.size ? `?${query}` : ''}`
    const res = await fetch(url, { method, headers, body })
    if (!res.ok) {
      throw new Error(
        `${res.status} ${res.statusText} for ${method} ${canonicalUri}: ${await res.text()}`,
      )
    }
    return res
  }

  const bucketUri = `/${uriEncode(bucket, false)}`
  const objectUri = (key) => `${bucketUri}/${uriEncode(key, false)}`

  return {
    /** ListObjectsV2, following continuation tokens. Returns [{key, size}]. */
    async list(prefix) {
      const out = []
      let token
      do {
        const query = new URLSearchParams({ 'list-type': '2', prefix, 'max-keys': '1000' })
        if (token) query.set('continuation-token', token)
        const xml = await (await request('GET', bucketUri, query)).text()
        for (const chunk of xml.split('<Contents>').slice(1)) {
          const key = /<Key>([\s\S]*?)<\/Key>/.exec(chunk)?.[1]
          const size = /<Size>(\d+)<\/Size>/.exec(chunk)?.[1]
          if (key) out.push({ key: decodeXml(key), size: Number(size ?? 0) })
        }
        token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
          ? decodeXml(
              /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)?.[1] ?? '',
            )
          : undefined
      } while (token)
      return out
    },

    get: (key) => request('GET', objectUri(key), new URLSearchParams()),

    /** PutObject. `body` must be a Buffer (SigV4 needs the payload digest). */
    put: (key, body, contentType = contentTypeFor(key)) =>
      request('PUT', objectUri(key), new URLSearchParams(), body, {
        'Content-Type': contentType,
      }),
  }
}

/** Run `worker` over `items` with at most `limit` in flight. */
export async function pool(items, limit, worker) {
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++
      await worker(items[i], i)
    }
  })
  await Promise.all(runners)
}

export function fmtBytes(n) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = n
  let u = 0
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024
    u++
  }
  return `${v.toFixed(v < 10 && u > 0 ? 1 : 0)} ${units[u]}`
}
