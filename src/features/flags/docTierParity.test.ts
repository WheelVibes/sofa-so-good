import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'

/**
 * UIUX-72 doc/registry tier parity.
 *
 * `docs/ARCHITECTURE.md` names each feature's tier inline, and that prose had
 * drifted from the registry on EIGHT flags — including `sceneExport3d`, where
 * the doc said "pro" while the registry had it at `simple`, so Simple mode
 * offered a casual owner a Wavefront OBJ and an "STL for 3D printing / CAD"
 * (UIUX-71). The registry is the source of truth (it drives `resolveFlags`, and
 * the flag tests assert it); this guard keeps the prose honest so the next
 * reader can trust it — and so a tier change has to update its own docs.
 *
 * Two doc conventions are recognised: "`flag` flag, pro" and
 * "`flag` **pro** flag". Anything else is invisible to this guard by design —
 * it only checks claims it can read unambiguously.
 */
const DOC = readFileSync(join(__dirname, '../../../docs/ARCHITECTURE.md'), 'utf8')

describe('flag tiers claimed in ARCHITECTURE.md match the registry', () => {
  /** The two conventions the doc uses to name a flag's tier. */
  const claimPatterns = (name: string) => [
    new RegExp(`\`${name}\`\\s+flag,\\s*(pro|simple)\\b`, 'g'),
    new RegExp(`\`${name}\`\\s+\\*\\*(pro|simple)\\*\\*\\s+flag`, 'g'),
  ]

  it('every readable tier claim agrees with FEATURE_FLAGS', () => {
    const mismatches: string[] = []
    for (const [name, def] of Object.entries(FEATURE_FLAGS)) {
      for (const rx of claimPatterns(name)) {
        for (const m of DOC.matchAll(rx)) {
          if (m[1] !== def.tier) {
            mismatches.push(`${name}: registry=${def.tier} but doc says ${m[1]}`)
          }
        }
      }
    }
    expect(mismatches).toEqual([])
  })

  it('reads enough claims to be meaningful (guards against a silent no-op)', () => {
    const claims = Object.keys(FEATURE_FLAGS).filter((name) =>
      claimPatterns(name).some((rx) => rx.test(DOC)),
    ).length
    expect(claims).toBeGreaterThan(30)
  })
})
