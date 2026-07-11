import { LoadingManager } from 'three'
import { afterEach, describe, expect, it } from 'vitest'
import {
  __resetSecureGltfManagerForTest,
  BLOCKED_RESOURCE_FALLBACK,
  getSecureGltfManager,
  isAllowedModelResourceUrl,
  isEmbeddedOrBlobUrl,
  secureGltfLoader,
} from './loaderSecurity'

const OWN_ORIGIN = 'https://app.example.com'

describe('isEmbeddedOrBlobUrl (SEC-1)', () => {
  it('allows data: and blob: URIs', () => {
    expect(isEmbeddedOrBlobUrl('data:image/png;base64,AAAA')).toBe(true)
    expect(isEmbeddedOrBlobUrl('blob:https://app.example.com/abc-123')).toBe(true)
  })

  it('is case-insensitive on the scheme', () => {
    expect(isEmbeddedOrBlobUrl('DATA:image/png;base64,AAAA')).toBe(true)
    expect(isEmbeddedOrBlobUrl('Blob:xyz')).toBe(true)
  })

  it('rejects a foreign http(s) URL', () => {
    expect(isEmbeddedOrBlobUrl('https://evil.example/track.png')).toBe(false)
    expect(isEmbeddedOrBlobUrl('http://evil.example/track.png')).toBe(false)
  })

  it('is not fooled by embedded control chars pretending to bypass the scheme check', () => {
    // "da\tta:" still normalizes to "data:" in browsers, so it must still be
    // treated as allowed (same defense used by utils/safeUrl.ts) rather than
    // falling through to the foreign-URL branch.
    expect(isEmbeddedOrBlobUrl('da\tta:image/png;base64,AAAA')).toBe(true)
  })
})

describe('isAllowedModelResourceUrl (SEC-1 render-path policy)', () => {
  it('allows data: and blob: regardless of origin', () => {
    expect(isAllowedModelResourceUrl('data:image/png;base64,AAAA', OWN_ORIGIN)).toBe(true)
    expect(isAllowedModelResourceUrl('blob:https://app.example.com/abc', OWN_ORIGIN)).toBe(true)
    // blob: URLs are always same-page in practice, but the scheme alone is
    // sufficient — never network-fetched regardless of what host it names.
    expect(isAllowedModelResourceUrl('blob:https://other.example/abc', OWN_ORIGIN)).toBe(true)
  })

  it('allows an absolute same-origin URL — the app serving its own GLB + sibling files', () => {
    expect(isAllowedModelResourceUrl(`${OWN_ORIGIN}/models/chair.glb`, OWN_ORIGIN)).toBe(true)
    expect(
      isAllowedModelResourceUrl(`${OWN_ORIGIN}/models/chair-textures/wood.jpg`, OWN_ORIGIN),
    ).toBe(true)
  })

  it('allows a root-relative same-origin path — the app serving a bundled builtin GLB', () => {
    // The top-level url drei passes for a builtin GLB (`${BASE_URL}assets/...`)
    // reaches the modifier root-relative — it must NOT be blocked, or every
    // builtin GLB renders as a placeholder box.
    expect(isAllowedModelResourceUrl('/assets/furniture/pool-table-6ft.glb', OWN_ORIGIN)).toBe(true)
    expect(
      isAllowedModelResourceUrl('/sofa-so-good/assets/furniture/tea-set.glb', OWN_ORIGIN),
    ).toBe(true)
  })

  it('blocks an absolute foreign-origin URL — the SEC-1 attack the fix closes', () => {
    expect(isAllowedModelResourceUrl('https://evil.example/beacon.png', OWN_ORIGIN)).toBe(false)
    expect(isAllowedModelResourceUrl('http://192.168.1.1/probe', OWN_ORIGIN)).toBe(false)
  })

  it('blocks a protocol-relative URL — same-origin leading slash must not cover //host', () => {
    // `//evil.example/x` is NOT same-origin (it addresses evil.example); the
    // root-relative allowance is a single leading slash only.
    expect(isAllowedModelResourceUrl('//evil.example/beacon.png', OWN_ORIGIN)).toBe(false)
  })

  it('blocks a different scheme/port on the same host (not a true origin match)', () => {
    expect(isAllowedModelResourceUrl('http://app.example.com/x.png', OWN_ORIGIN)).toBe(false)
    expect(isAllowedModelResourceUrl('https://app.example.com:8443/x.png', OWN_ORIGIN)).toBe(false)
  })

  it('allows an empty uri (glTF default / no-op resolveURL input)', () => {
    expect(isAllowedModelResourceUrl('', OWN_ORIGIN)).toBe(true)
  })

  it('blocks an unresolvable bare string rather than guessing', () => {
    // GLTFLoader resolves relative refs against the model's own base path
    // before the URL modifier ever sees them, so a bare non-URL string here
    // signals something already went wrong — fail closed, not open.
    expect(isAllowedModelResourceUrl('not a url', OWN_ORIGIN)).toBe(false)
  })
})

describe('getSecureGltfManager (SEC-1 shared render manager)', () => {
  afterEach(() => {
    __resetSecureGltfManagerForTest()
  })

  it('returns the same manager instance on repeated calls (one shared policy)', () => {
    expect(getSecureGltfManager()).toBe(getSecureGltfManager())
  })

  it('resolveURL passes through data:/blob: unchanged', () => {
    const mgr = getSecureGltfManager()
    expect(mgr.resolveURL('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA')
    expect(mgr.resolveURL('blob:http://localhost/abc')).toBe('blob:http://localhost/abc')
  })

  it('resolveURL rewrites a foreign absolute URL to the blocked fallback', () => {
    const mgr = getSecureGltfManager()
    expect(mgr.resolveURL('https://evil.example/beacon.png')).toBe(BLOCKED_RESOURCE_FALLBACK)
  })
})

describe('secureGltfLoader (drei useGLTF extendLoader injection point)', () => {
  afterEach(() => {
    __resetSecureGltfManagerForTest()
  })

  it('installs the shared manager on any loader-shaped object, idempotently', () => {
    const loader = { manager: new LoadingManager() }
    secureGltfLoader(loader)
    const installed = loader.manager
    expect(installed).toBe(getSecureGltfManager())
    secureGltfLoader(loader)
    expect(loader.manager).toBe(installed)
  })
})
