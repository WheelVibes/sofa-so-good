import { type FormEvent, useState } from 'react'
import { isAdminUser } from '../../features/auth/types'
import { useStore } from '../../state/store'
import { BrandMark } from '../Logo'
import { Icon } from '../toolbar/icons'

/**
 * Full-screen admin sign-in. Reached via `#/login` or the account entry in Help.
 * Optional (not a wall) — the app works signed out; admin only unlocks the
 * dev-only features + flags panel. Client-side gate, not a security boundary.
 */
export function LoginScreen() {
  const open = useStore((s) => s.loginOpen)
  const setOpen = useStore((s) => s.setLoginOpen)
  const currentUser = useStore((s) => s.currentUser)
  const authError = useStore((s) => s.authError)
  const providerLabel = useStore((s) => s.authProviderLabel)
  const signIn = useStore((s) => s.signIn)
  const signOut = useStore((s) => s.signOut)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  if (!open) return null

  const close = () => {
    setPassword('')
    setOpen(false)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const ok = await signIn({ password })
    setBusy(false)
    if (ok) close()
  }

  return (
    <div
      className="login-screen"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-modal, 70)' as never,
        display: 'grid',
        placeItems: 'center',
        background: 'color-mix(in oklch, var(--scene-b, #1a1714) 60%, transparent)',
        backdropFilter: 'blur(var(--blur, 8px))',
        padding: 'var(--s-4)',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Sign in"
    >
      <div className="panel" style={{ width: 'min(380px, 100%)', padding: 'var(--s-5)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--s-2)',
            marginBottom: 'var(--s-2)',
          }}
        >
          <BrandMark size={26} />
          <div className="panel-title" style={{ fontSize: 'var(--t-1)' }}>
            Sofa So Good
          </div>
        </div>

        {currentUser ? (
          <>
            <p className="panel-sub" style={{ textTransform: 'none', letterSpacing: 0 }}>
              Signed in as <b style={{ color: 'var(--text)' }}>{currentUser.name}</b> ·{' '}
              {currentUser.role}
            </p>
            <p style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)', lineHeight: 1.5 }}>
              {isAdminUser(currentUser)
                ? 'Admin unlocks dev-only features and the feature-flags panel.'
                : ''}
            </p>
            {isAdminUser(currentUser) ? (
              <button
                type="button"
                className="btn btn-soft btn-block"
                style={{ marginTop: 'var(--s-2)' }}
                onClick={() => {
                  setOpen(false)
                  useStore.getState().setFlagsPanelOpen(true)
                }}
              >
                <Icon.Tools width={14} height={14} />
                Feature flags
              </button>
            ) : null}
            <div style={{ display: 'flex', gap: 'var(--s-2)', marginTop: 'var(--s-3)' }}>
              <button type="button" className="btn btn-danger" onClick={signOut}>
                <Icon.ExitRoom width={14} height={14} />
                Sign out
              </button>
              <button
                type="button"
                className="btn btn-accent"
                style={{ marginLeft: 'auto' }}
                onClick={close}
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={submit}>
            <p className="panel-sub" style={{ textTransform: 'none', letterSpacing: 0 }}>
              {providerLabel} sign-in
            </p>
            <p
              style={{
                fontSize: 'var(--t-2xs)',
                color: 'var(--text-3)',
                lineHeight: 1.5,
                margin: '0 0 var(--s-3)',
              }}
            >
              Unlocks dev-only features. This is a client-side gate, not a security boundary.
            </p>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              aria-label="Password"
              style={{ width: '100%' }}
            />
            {authError ? (
              <p
                style={{
                  color: 'var(--danger)',
                  fontSize: 'var(--t-2xs)',
                  marginTop: 'var(--s-2)',
                }}
              >
                {authError}
              </p>
            ) : null}
            <div style={{ display: 'flex', gap: 'var(--s-2)', marginTop: 'var(--s-3)' }}>
              <button type="button" className="btn btn-soft" onClick={close}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-accent"
                style={{ marginLeft: 'auto' }}
                disabled={busy || password.length === 0}
              >
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
