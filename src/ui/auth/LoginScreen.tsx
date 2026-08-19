import { type FormEvent, useState } from 'react'
import { isAdminUser } from '../../features/auth/types'
import { useStore } from '../../state/store'
import { BrandMark } from '../Logo'
import { Icon } from '../toolbar/icons'
import { Turnstile, turnstileEnabled } from './Turnstile'
import { UserManagementModal } from './UserManagementModal'

/**
 * Full-screen sign-in. Reached via `#/login` or the account entry in Help.
 *
 * Sign-in requires a real backend (`authIsBackend`): email + password accounts
 * with server sessions, ADMIN-CREATED ONLY (no sign-up here). A signed-in admin
 * can manage accounts and open the feature-flags panel. Without a backend
 * (offline / GitHub Pages build) there is no sign-in — the entry points are
 * hidden and this screen shows a short "not available" note if reached directly.
 */
export function LoginScreen() {
  const open = useStore((s) => s.loginOpen)
  const setOpen = useStore((s) => s.setLoginOpen)
  const currentUser = useStore((s) => s.currentUser)
  const authError = useStore((s) => s.authError)
  const providerLabel = useStore((s) => s.authProviderLabel)
  const isBackend = useStore((s) => s.authIsBackend)
  const signIn = useStore((s) => s.signIn)
  const signOut = useStore((s) => s.signOut)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [turnstileToken, setTurnstileToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)

  if (!open) return null

  const close = () => {
    setEmail('')
    setPassword('')
    setTurnstileToken('')
    setOpen(false)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const ok = isBackend
      ? await signIn({ username: email, password, turnstileToken })
      : await signIn({ password })
    setBusy(false)
    if (ok) close()
  }

  return (
    <div
      className="login-screen"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-modal)' as never,
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
          <div className="panel-title" style={{ fontSize: 'var(--t-lg)' }}>
            Sofa So Good
          </div>
        </div>

        {currentUser ? (
          <>
            <p className="panel-sub plain">
              Signed in as <b style={{ color: 'var(--text)' }}>{currentUser.name}</b> ·{' '}
              {currentUser.role}
            </p>
            <p style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)', lineHeight: 1.5 }}>
              {isAdminUser(currentUser)
                ? 'Your designs sync to the cloud. Admin unlocks dev-only features and the feature-flags panel.'
                : 'Your designs and favourites sync to the cloud on this account.'}
            </p>
            {isAdminUser(currentUser) ? (
              <button
                type="button"
                className="btn btn-soft btn-block"
                style={{ marginTop: 'var(--s-2)' }}
                onClick={() => setManageOpen(true)}
              >
                <Icon.Settings width={14} height={14} />
                Manage accounts
              </button>
            ) : null}
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
            {manageOpen ? <UserManagementModal onClose={() => setManageOpen(false)} /> : null}
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
        ) : isBackend ? (
          <form onSubmit={submit}>
            <p className="panel-sub plain">{providerLabel} sign-in</p>
            <p
              style={{
                fontSize: 'var(--t-2xs)',
                color: 'var(--text-3)',
                lineHeight: 1.5,
                margin: '0 0 var(--s-3)',
              }}
            >
              Sign in with your account. Accounts are created by an administrator.
            </p>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              aria-label="Email"
              autoComplete="username"
              style={{ width: '100%', marginBottom: 'var(--s-2)' }}
            />
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              aria-label="Password"
              autoComplete="current-password"
              style={{ width: '100%' }}
            />
            <Turnstile onToken={setTurnstileToken} />
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
                disabled={
                  busy ||
                  password.length === 0 ||
                  email.length === 0 ||
                  (turnstileEnabled() && turnstileToken.length === 0)
                }
              >
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </div>
          </form>
        ) : (
          // No backend configured (GitHub Pages / offline build) — there is no
          // sign-in. The entry points are hidden in this build; this is the
          // defensive fallback if #/login is reached directly.
          <>
            <p
              style={{
                fontSize: 'var(--t-2xs)',
                color: 'var(--text-3)',
                lineHeight: 1.5,
                margin: '0 0 var(--s-3)',
              }}
            >
              Sign-in isn’t available in this build — the app runs fully on this device with no
              account needed.
            </p>
            <div style={{ display: 'flex', marginTop: 'var(--s-3)' }}>
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
        )}
      </div>
    </div>
  )
}
