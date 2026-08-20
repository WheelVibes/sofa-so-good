/**
 * App version — `major.minor.patch.build`.
 *
 * Single source of truth for the running build. A "Check for updates" flow
 * compares this against the deployed build (see `isNewerVersion`). `package.json`
 * mirrors the first three parts (valid semver) for tooling.
 *
 * Bump rules (also in the root CLAUDE.md):
 *  - Every commit bumps the **build** (or **patch** / **minor** for bigger work).
 *  - A PR to `main` bumps **patch** or **minor** depending on how big / how many
 *    features it carries.
 *  - **Never** bump **major** until explicitly told to.
 */
export const APP_VERSION = '0.26.2.23'

export interface VersionParts {
  major: number
  minor: number
  patch: number
  build: number
}

/** Parse a `major.minor.patch.build` string; missing/garbage parts → 0. */
export function parseVersion(v: string): VersionParts {
  const [major = 0, minor = 0, patch = 0, build = 0] = v
    .trim()
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0)
  return { major, minor, patch, build }
}

/** True when `a` is a strictly newer version than `b` (field by field). */
export function isNewerVersion(a: string, b: string): boolean {
  const x = parseVersion(a)
  const y = parseVersion(b)
  for (const k of ['major', 'minor', 'patch', 'build'] as const) {
    if (x[k] !== y[k]) return x[k] > y[k]
  }
  return false
}
