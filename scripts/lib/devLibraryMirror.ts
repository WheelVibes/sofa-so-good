/**
 * Where the dev API looks for the local mirror of the R2 shared-library bucket
 * (`scripts/dev-api.ts`'s `LIBRARY` binding). Pure — the filesystem is injected
 * as an `exists` predicate — so the whole lookup is unit-testable.
 *
 * Two mirror layouts exist in practice, and BOTH have to resolve or a feature
 * that reads the bucket 404s in dev while working in production:
 *
 *  - **R2-shaped** — exactly the keys the bucket holds, which is what
 *    `scripts/pull-r2-library.mjs` writes (default `resources/`):
 *      `library/index.json` · `library/acg-index.json` · `ikea/<group>/<file>` ·
 *      `acg/<AssetId>/<map>.webp`
 *  - **Legacy flat IKEA scrape** — the `ikea_optimized/` tree that predates the
 *    `acg/` prefix, uploaded with the `ikea/` prefix stripped:
 *      `library-index.json` · `<group>/<file>`
 *
 * The legacy tree cannot express an `acg/` key at all, so a dev API pointed only
 * at it answered every ambientCG request with a 404 — the manifest fetch failed,
 * `acgLibrary.fetchIndex` threw, and an applied `ambientcg:<slug>:1k` finish
 * quietly stayed on its fallback. Hence: search a LIST of roots, try the exact
 * key first and the legacy rewrite second, and take the first hit.
 */

import { resolve } from 'node:path'

/**
 * Mirror roots searched in order when `DEV_LIBRARY_DIR` is not set, relative to
 * the repo root. `resources/` first because that is what `pull-r2-library`
 * writes today and the only layout that can hold `acg/`; the legacy IKEA scrape
 * output second.
 */
export const DEV_LIBRARY_DIRS = ['resources', 'ikea_optimized'] as const

/** Absolute mirror roots to search. An explicit `DEV_LIBRARY_DIR` (absolute or
 *  repo-relative) wins outright — an operator naming one dir means that dir. */
export function mirrorRoots(repoRoot: string, override?: string): string[] {
  const dirs = override?.trim() ? [override.trim()] : DEV_LIBRARY_DIRS
  return dirs.map((d) => resolve(repoRoot, d))
}

/**
 * Candidate absolute paths for one R2 key under one root: the key verbatim
 * (R2-shaped mirror), then the legacy flat-scrape rewrite when it differs.
 * Paths that would escape `rootAbs` are dropped — the route already rejects
 * `..`, this is belt + braces.
 */
export function mirrorKeyPaths(rootAbs: string, key: string): string[] {
  const legacy =
    key === 'library/index.json'
      ? 'library-index.json'
      : key.startsWith('ikea/')
        ? key.slice('ikea/'.length)
        : null
  const rels = legacy && legacy !== key ? [key, legacy] : [key]
  const out: string[] = []
  for (const rel of rels) {
    const abs = resolve(rootAbs, rel)
    if (abs === rootAbs || abs.startsWith(`${rootAbs}/`)) out.push(abs)
  }
  return out
}

/** First existing file for `key` across `roots`, or `null` when the key is in
 *  no mirror (→ the same 404 an empty bucket gives). */
export function resolveMirrorPath(
  roots: readonly string[],
  key: string,
  exists: (path: string) => boolean,
): string | null {
  for (const root of roots) {
    for (const path of mirrorKeyPaths(root, key)) {
      if (exists(path)) return path
    }
  }
  return null
}

/** Manifests that tell an operator which catalogs a mirror can actually serve. */
const MANIFESTS: { label: string; key: string }[] = [
  { label: 'ikea', key: 'library/index.json' },
  { label: 'ambientcg', key: 'library/acg-index.json' },
]

/**
 * One-line-per-root summary for the boot log: which roots exist and which
 * catalog manifests each can serve. `found` is the flattened set of labels, so
 * the caller can say "shared catalog stays empty" when it is empty.
 */
export function describeMirrors(
  roots: readonly string[],
  exists: (path: string) => boolean,
): { lines: string[]; found: string[] } {
  const lines: string[] = []
  const found = new Set<string>()
  for (const root of roots) {
    if (!exists(root)) continue
    const labels = MANIFESTS.filter(({ key }) =>
      mirrorKeyPaths(root, key).some((p) => exists(p)),
    ).map(({ label }) => label)
    for (const l of labels) found.add(l)
    lines.push(`${root} (${labels.length ? `${labels.join(' + ')} manifests` : 'no manifest'})`)
  }
  return { lines, found: [...found] }
}
