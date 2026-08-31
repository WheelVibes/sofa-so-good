import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * PROBE-IMPORT-PATHS — every `import('/src/...')` a dev-probe makes must point at
 * a file that exists.
 *
 * The probes reach into the app from INSIDE `page.evaluate`, e.g.
 * `await import('/src/scene/cameras/walkTeleport.ts')`. That specifier is a Vite
 * dev-server URL resolved by the browser at runtime, not a Node import resolved
 * from disk, so knip parses it statically and reports all ~100 of them as
 * unresolved. `knip.jsonc` therefore carries `ignoreUnresolved: ["^/src/"]`.
 *
 * That silences a real check: a probe pointing at a renamed or deleted module
 * would no longer be caught by anything until someone ran that probe and read
 * the failure. This test restores the check on exactly the specifiers knip is
 * now told to skip, and nothing else.
 */
const DIR = path.join(process.cwd(), 'scripts', 'dev-probes')
const SPECIFIER = /import\(\s*['"](\/src\/[^'"]+)['"]\s*\)/g

function probeFiles(): string[] {
  if (!fs.existsSync(DIR)) return []
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith('.mjs'))
    .sort()
}

describe('dev-probe /src imports', () => {
  it('finds probes to check', () => {
    // Guards the guard: a bad DIR or glob would make every assertion below pass
    // vacuously, which is how a green test ends up protecting nothing.
    expect(probeFiles().length).toBeGreaterThan(20)
  })

  it('points every /src specifier at a file that exists', () => {
    const broken: string[] = []
    let seen = 0
    for (const file of probeFiles()) {
      const src = fs.readFileSync(path.join(DIR, file), 'utf8')
      for (const m of src.matchAll(SPECIFIER)) {
        seen++
        const rel = m[1].replace(/^\//, '')
        if (!fs.existsSync(path.join(process.cwd(), rel))) broken.push(`${file} -> ${m[1]}`)
      }
    }
    // Guards the guard again: if the pattern stopped matching — a probe style
    // change, a regex typo — `broken` would be empty and this test would pass
    // while checking nothing. knip reported ~100 such specifiers.
    expect(seen).toBeGreaterThan(50)
    expect(broken).toEqual([])
  })
})
