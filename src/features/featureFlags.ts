/**
 * Feature-flag barrel — the single import surface for the flag system, kept at the
 * original path so every `from '../features/featureFlags'` import stays valid.
 *
 * Implementation is split for modularity:
 *   - `./flags/types`    — the `FeatureFlag` union, `FlagDef`, `FlagOverrides`.
 *   - `./flags/registry` — the `FEATURE_FLAGS` data registry + `FEATURE_FLAG_KEYS`.
 *   - `./flags/resolve`  — `resolveFlags`, override parsing, and the runtime snapshot
 *                          (`isFeatureEnabled` / `setResolvedFlags`).
 *
 * See CLAUDE.md: every user-facing feature must have an entry in the registry and be
 * categorised `tier: 'simple' | 'pro'`.
 */

export { FEATURE_FLAG_KEYS, FEATURE_FLAGS } from './flags/registry'
export {
  clearStoredOverrides,
  isFeatureEnabled,
  loadOverrides,
  parseFlagOverrides,
  parseStoredOverrides,
  persistOverride,
  resolveFlags,
  setResolvedFlags,
} from './flags/resolve'
export type { FeatureFlag } from './flags/types'
