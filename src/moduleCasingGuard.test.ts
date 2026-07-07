import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Case-collision guard (DESKTOP-CI-CASING): CI typechecks on Linux
 * (case-sensitive), but the desktop/mobile packaging jobs build on Windows and
 * macOS, whose default filesystems resolve extensionless imports
 * case-INsensitively. Two same-directory entries whose names differ only in
 * case (`RoomShell.tsx` + `roomShell.ts`, or a `Toolbar.tsx` shim next to a
 * `toolbar/` directory) typecheck fine here yet break those builds with
 * TS1149/TS2693 ("file differs only in casing" / a component import silently
 * resolving to the helper module). The first-ever Windows/macOS package run
 * failed exactly this way — this guard makes the invariant fail fast on Linux.
 */

/** Module-resolution base name: basename without .ts/.tsx (directories keep
 *  their full name — `import './toolbar'` resolves `toolbar.tsx` OR `toolbar/`).
 *  A same-CASE file/dir pair (`templates.ts` + `templates/`) is fine — the file
 *  wins deterministically on every platform; only pairs whose base names differ
 *  in case resolve DIFFERENTLY per filesystem, so only those are flagged. */
function resolutionBase(name: string, isDir: boolean): string {
  return isDir ? name : name.replace(/\.(ts|tsx)$/, '')
}

function collectCollisions(dir: string, rel: string, out: string[]): void {
  const entries = readdirSync(dir, { withFileTypes: true })
  const byKey = new Map<string, Map<string, string[]>>()
  for (const e of entries) {
    if (!e.isDirectory() && !/\.(ts|tsx)$/.test(e.name)) continue
    if (e.name === 'node_modules') continue
    const base = resolutionBase(e.name, e.isDirectory())
    const casings = byKey.get(base.toLowerCase()) ?? new Map<string, string[]>()
    const list = casings.get(base) ?? []
    list.push(e.name + (e.isDirectory() ? '/' : ''))
    casings.set(base, list)
    byKey.set(base.toLowerCase(), casings)
    if (e.isDirectory()) collectCollisions(join(dir, e.name), `${rel}${e.name}/`, out)
  }
  for (const [, casings] of byKey) {
    if (casings.size > 1) {
      const names = [...casings.values()].flat()
      out.push(`${rel}{ ${names.join(' ↔ ')} }`)
    }
  }
}

describe('module filename casing (DESKTOP-CI-CASING)', () => {
  it('no two sibling modules/directories differ only in casing', () => {
    const collisions: string[] = []
    collectCollisions(join(__dirname), 'src/', collisions)
    expect(
      collisions,
      'Same-directory names that collide under case-insensitive module resolution ' +
        '(breaks the Windows/macOS desktop packaging build) — rename one of each pair:',
    ).toEqual([])
  })
})
