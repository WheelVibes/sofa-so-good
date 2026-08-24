// fake-indexeddb installs a global `indexedDB` — used by storage/pack/upload
// tests in BOTH node and happy-dom environments, so it loads unconditionally.
import 'fake-indexeddb/auto'

// jest-dom only extends `expect` with DOM matchers — pointless (and a per-file
// import cost) in the default node environment where there is no DOM. Load it
// only for files running under happy-dom (`// @vitest-environment happy-dom`).
if (typeof document !== 'undefined') {
  await import('@testing-library/jest-dom/vitest')

  // Node ≥ 25 enables the Web Storage API by default, which declares a global
  // `localStorage` that shadows the one happy-dom would otherwise install —
  // leaving it `undefined` here and failing every DOM test that touches it with
  // a bare `Cannot read properties of undefined`. Both upstream issues are open
  // (vitest #8757, happy-dom #1950) and `--no-webstorage` is the documented
  // workaround, wired into the `test`/`test:watch` scripts. Running vitest
  // directly (`npx vitest`) bypasses those scripts, so fail loudly with the fix
  // instead of leaving someone to debug the undefined.
  if (typeof localStorage === 'undefined') {
    throw new Error(
      'localStorage is undefined under happy-dom: Node >= 25 shadows it with its own ' +
        'Web Storage global (vitest#8757, happy-dom#1950).\n' +
        'Run tests via `npm test` / `npm run test:watch` (they set ' +
        'NODE_OPTIONS=--no-webstorage), or export NODE_OPTIONS=--no-webstorage before ' +
        'invoking vitest directly.',
    )
  }
}
