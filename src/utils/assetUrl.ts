/** Resolve a root-relative public-asset path against Vite's `base`.
 *
 * Bundled assets live under `public/` and are referenced with root-absolute
 * paths like `/assets/materials/floor-wood-oak/albedo.jpg`. Production builds
 * are served under a sub-path (`base: '/sofa-so-good/'` for GitHub Pages), so a
 * bare `/assets/...` URL 404s there. Prepending `import.meta.env.BASE_URL`
 * (`/` in dev, `/sofa-so-good/` in prod) makes the path correct in both.
 *
 * Already-absolute URLs (http(s):, blob:, data:) and protocol-relative `//`
 * URLs — e.g. runtime blob URLs for user uploads or remote CC0 catalog
 * entries — are returned untouched.
 */
export function withBase(url: string): string {
  if (!url.startsWith('/') || url.startsWith('//')) return url
  const base = import.meta.env.BASE_URL // ends with a trailing slash
  return base + url.replace(/^\//, '')
}
