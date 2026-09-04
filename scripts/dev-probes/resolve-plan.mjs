/**
 * Resolve a `PLAN=` spec to a template, by NAME as well as by index.
 *
 * **Why this exists.** `PLAN=` was a positional index into `PLAN_TEMPLATES`, a
 * hand-ordered array that grows. Every measurement this arc recorded against
 * `PLAN=3` is therefore keyed to a number whose meaning changes the moment a
 * template is inserted above it — the results stay in the CHANGELOG and silently
 * re-bind to a different flat. That is the same defect class as the version
 * collisions in `src/changelogVersions.test.ts` and the argparse trap in
 * `python/scripts/blender/cli_argv.py`: an identifier that is not stable is a
 * mechanism problem, not something care avoids.
 *
 * A name is stable, so `PLAN=4-Room` keeps meaning the 4-Room flat. Indices still
 * work, because existing invocations use them.
 *
 * **Ambiguity is an error, not a first match.** `PLAN=Executive` matches both
 * "Executive Apartment" and "Executive Maisonette" in the shipped list. Picking
 * the first would run a *different plan than asked for* and report a plan name
 * that looks right — the worst available outcome. It raises instead, and lists
 * both.
 */

/** `{index, id, name}` on success, `{error}` with the candidates on failure. */
export function resolvePlanSpec(list, spec) {
  if (!Array.isArray(list) || list.length === 0) return { error: 'no templates in the list' }
  const describe = () =>
    list.map((p, i) => `${i}=${p.id ?? '?'}${p.name ? ` (${p.name})` : ''}`).join(', ')

  const s = String(spec ?? '').trim()
  if (s === '') return { error: 'empty PLAN spec' }

  // An index, only when the WHOLE spec is digits: "3" is index 3, but "3Gen" and
  // "3-Room" are names and must not be truncated to 3.
  if (/^\d+$/.test(s)) {
    const i = Number(s)
    const p = list[i]
    if (!p) return { error: `no template at index ${i} of ${list.length}; have ${describe()}` }
    return { index: i, id: p.id ?? null, name: p.name ?? null }
  }

  const lc = s.toLowerCase()
  const at = (i) => ({ index: i, id: list[i].id ?? null, name: list[i].name ?? null })

  // Exact id, then exact name. An exact hit wins outright, so a name that happens
  // to be a substring of a longer one is still reachable.
  const exact = list.findIndex((p) => p.id === s || String(p.name ?? '').toLowerCase() === lc)
  if (exact !== -1) return at(exact)

  const partial = list
    .map((p, i) => ({ i, hay: `${p.id ?? ''} ${p.name ?? ''}`.toLowerCase() }))
    .filter(({ hay }) => hay.includes(lc))
    .map(({ i }) => i)
  if (partial.length === 1) return at(partial[0])
  if (partial.length > 1) {
    return {
      error:
        `PLAN=${s} is AMBIGUOUS — matches ${partial.map((i) => `${i}=${list[i].name ?? list[i].id}`).join(', ')}. ` +
        'Give the full name or the index; a first-match would silently run a different plan.',
    }
  }
  return { error: `PLAN=${s} matched no template; have ${describe()}` }
}
