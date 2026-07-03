// fake-indexeddb installs a global `indexedDB` — used by storage/pack/upload
// tests in BOTH node and happy-dom environments, so it loads unconditionally.
import 'fake-indexeddb/auto'

// jest-dom only extends `expect` with DOM matchers — pointless (and a per-file
// import cost) in the default node environment where there is no DOM. Load it
// only for files running under happy-dom (`// @vitest-environment happy-dom`).
if (typeof document !== 'undefined') {
  await import('@testing-library/jest-dom/vitest')
}
