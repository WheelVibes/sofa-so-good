import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { ApiError, apiFetch } from '../../features/api/client'
import { EmptyState } from '../EmptyState'
import { Icon } from '../toolbar/icons'

/**
 * Admin-only account management. Accounts can ONLY be created here (there is no
 * public signup) — an admin adds people, lists them, and can delete them. Backed
 * by `/api/admin/users` (admin session required, enforced server-side too).
 */

interface AdminUser {
  id: string
  email: string
  name: string
  role: 'admin' | 'user'
  createdAt: string
}

export function UserManagementModal({ onClose }: { onClose: () => void }) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'user' | 'admin'>('user')

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const { users } = await apiFetch<{ users: AdminUser[] }>('/admin/users')
      setUsers(users)
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load accounts.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const create = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await apiFetch('/admin/users', {
        method: 'POST',
        body: JSON.stringify({ email, name, password, role }),
      })
      setEmail('')
      setName('')
      setPassword('')
      setRole('user')
      await refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create account.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string) => {
    setBusy(true)
    setError(null)
    try {
      await apiFetch(`/admin/users/${id}`, { method: 'DELETE' })
      await refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete account.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="modal-overlay"
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
      aria-label="Manage accounts"
    >
      <div className="panel" style={{ width: 'min(560px, 100%)', padding: 'var(--s-5)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--s-2)',
            marginBottom: 'var(--s-3)',
          }}
        >
          <div className="panel-title" style={{ fontSize: 'var(--t-1)' }}>
            Manage accounts
          </div>
          <button
            type="button"
            className="btn btn-soft"
            style={{ marginLeft: 'auto' }}
            onClick={onClose}
          >
            Done
          </button>
        </div>

        <form
          onSubmit={create}
          style={{ display: 'grid', gap: 'var(--s-2)', marginBottom: 'var(--s-4)' }}
        >
          <p className="panel-sub" style={{ textTransform: 'none', letterSpacing: 0 }}>
            Create a new account
          </p>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            aria-label="Email"
            required
          />
          <input
            className="input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Display name (optional)"
            aria-label="Display name"
          />
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (min 8 characters)"
            aria-label="Password"
            required
          />
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--s-2)',
              fontSize: 'var(--t-2xs)',
            }}
          >
            <input
              type="checkbox"
              checked={role === 'admin'}
              onChange={(e) => setRole(e.target.checked ? 'admin' : 'user')}
            />
            Admin (can manage other accounts)
          </label>
          <button type="submit" className="btn btn-accent" disabled={busy}>
            {busy ? 'Working…' : 'Create account'}
          </button>
        </form>

        {error ? (
          <p
            style={{ color: 'var(--danger)', fontSize: 'var(--t-2xs)', marginBottom: 'var(--s-2)' }}
          >
            {error}
          </p>
        ) : null}

        <p className="panel-sub" style={{ textTransform: 'none', letterSpacing: 0 }}>
          Accounts ({users.length})
        </p>
        {loading ? (
          <p style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>Loading…</p>
        ) : users.length === 0 ? (
          <EmptyState
            icon={Icon.Home}
            title="No accounts yet"
            description="Create the first one above."
          />
        ) : (
          <div style={{ display: 'grid', gap: 'var(--s-1)', maxHeight: 280, overflowY: 'auto' }}>
            {users.map((u) => (
              <div
                key={u.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--s-2)',
                  padding: 'var(--s-2)',
                  borderRadius: 'var(--r-2)',
                  background: 'var(--surface-2)',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 'var(--t-2xs)',
                      color: 'var(--text)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {u.name} {u.role === 'admin' ? '· admin' : ''}
                  </div>
                  <div style={{ fontSize: 'var(--t-3xs)', color: 'var(--text-3)' }}>{u.email}</div>
                </div>
                <button
                  type="button"
                  className="btn btn-danger btn-icon"
                  style={{ marginLeft: 'auto' }}
                  aria-label={`Delete ${u.email}`}
                  disabled={busy}
                  onClick={() => remove(u.id)}
                >
                  <Icon.Trash width={14} height={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
