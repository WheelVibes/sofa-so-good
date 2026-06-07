import { isAdminUser } from '../features/auth/types'
import { FEATURE_FLAG_KEYS, FEATURE_FLAGS } from '../features/featureFlags'
import { useStore } from '../state/store'
import { Modal } from './Modal'

/**
 * Dev/admin feature-flags panel: toggle what's enabled for this session. Only
 * available in a dev build or to a signed-in admin (production users never see
 * it). Toggles are runtime overrides (persisted to localStorage) — production's
 * shipped defaults live in the `FEATURE_FLAGS` registry, not here.
 */
export function FlagsPanel() {
  const open = useStore((s) => s.flagsPanelOpen)
  const setOpen = useStore((s) => s.setFlagsPanelOpen)
  const flags = useStore((s) => s.featureFlags)
  const currentUser = useStore((s) => s.currentUser)
  const setFeatureFlag = useStore((s) => s.setFeatureFlag)
  const resetFeatureFlags = useStore((s) => s.resetFeatureFlags)

  const privileged = !!import.meta.env?.DEV || isAdminUser(currentUser)
  if (!open) return null
  if (!privileged) {
    return (
      <Modal open onClose={() => setOpen(false)} title="Feature flags" sub="Admin only">
        <div className="sec" style={{ borderTop: 'none' }}>
          <p style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)', lineHeight: 1.5 }}>
            Sign in as admin to toggle features.
          </p>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open
      onClose={() => setOpen(false)}
      title="Feature flags"
      sub="Dev / admin"
      panelId="flagsPanel"
    >
      <div className="sec" style={{ borderTop: 'none', paddingTop: 0 }}>
        <p
          style={{
            fontSize: 'var(--t-2xs)',
            color: 'var(--text-3)',
            lineHeight: 1.5,
            margin: '0 0 var(--s-2)',
          }}
        >
          Toggle features for this session (saved on this device). Production ships the registry
          defaults; these overrides only apply to dev/admin.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {FEATURE_FLAG_KEYS.map((key) => {
            const def = FEATURE_FLAGS[key]
            const on = flags[key]
            return (
              <label
                key={key}
                className="flag-row"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--s-2)',
                  padding: '6px 8px',
                  borderRadius: 'var(--r-1)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => setFeatureFlag(key, e.target.checked)}
                />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 'var(--t-xs)', color: 'var(--text)' }}>
                    {def.label}
                    {def.devOnly ? (
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: 9,
                          color: 'var(--accent-soft-text)',
                          border: '1px solid var(--border-2)',
                          borderRadius: 4,
                          padding: '0 4px',
                        }}
                      >
                        dev
                      </span>
                    ) : null}
                  </span>
                  <span style={{ display: 'block', fontSize: 10, color: 'var(--text-3)' }}>
                    {def.description}
                  </span>
                </span>
              </label>
            )
          })}
        </div>
        <button
          type="button"
          className="btn btn-soft btn-block"
          style={{ marginTop: 'var(--s-3)' }}
          onClick={resetFeatureFlags}
        >
          Reset to defaults
        </button>
      </div>
    </Modal>
  )
}
