import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useModalGuard } from '../../controls/modalGuard'
import { useDialogFocus } from '../../controls/useDialogFocus'
import { ApiError, apiFetch } from '../../features/api/client'
import { useStore } from '../../state/store'
import { EmptyState } from '../EmptyState'
import { Icon } from '../toolbar/icons'

/**
 * Admin-only account management. Accounts can ONLY be created here (there is no
 * public signup) — an admin adds people, lists them, resets their password /
 * role, and deletes them. Editing your own row is how the admin credentials are
 * rotated. Backed by `/api/admin/users` (admin session required, enforced
 * server-side too).
 */

interface AdminUser {
  id: string
  email: string
  name: string
  role: 'admin' | 'user'
  createdAt: string
}

export function UserManagementModal({ onClose }: { onClose: () => void }) {
  const currentUser = useStore((s) => s.currentUser)
  const refreshAuth = useStore((s) => s.refreshAuth)
  const panelRef = useRef<HTMLDivElement>(null)
  // Custom .modal-overlay (not the shared Modal): suppress global hotkeys and
  // manage focus ourselves (UIUX-3; see src/ui/CLAUDE.md).
  useModalGuard(true)
  useDialogFocus(true, panelRef)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'user' | 'admin'>('user')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editPassword, setEditPassword] = useState('')
  const [editRole, setEditRole] = useState<'user' | 'admin'>('user')

  const adminCount = users.filter((u) => u.role === 'admin').length

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

  const startEdit = (u: AdminUser) => {
    setEditingId(u.id)
    setEditPassword('')
    setEditRole(u.role)
    setError(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditPassword('')
  }

  const saveEdit = async (u: AdminUser) => {
    const body: { password?: string; role?: 'user' | 'admin' } = {}
    if (editPassword.length > 0) body.password = editPassword
    if (editRole !== u.role) body.role = editRole
    if (body.password === undefined && body.role === undefined) return
    setBusy(true)
    setError(null)
    try {
      await apiFetch(`/admin/users/${u.id}`, { method: 'PATCH', body: JSON.stringify(body) })
      cancelEdit()
      await refresh()
      // Editing your own row re-mints your session server-side — resync currentUser.
      if (currentUser && u.id === currentUser.id) await refreshAuth()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update account.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="modal-overlay auth-scrim"
      role="dialog"
      aria-modal="true"
      aria-label="Manage accounts"
    >
      <div
        ref={panelRef}
        className="panel"
        style={{ width: 'var(--modal-md)', padding: 'var(--s-5)' }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--s-2)',
            marginBottom: 'var(--s-3)',
          }}
        >
          <div className="panel-title" style={{ fontSize: 'var(--t-lg)' }}>
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
          <p className="panel-sub plain">Create a new account</p>
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

        <p className="panel-sub plain">Accounts ({users.length})</p>
        {loading ? (
          <p style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>Loading…</p>
        ) : users.length === 0 ? (
          <EmptyState
            icon={Icon.Home}
            title="No accounts yet"
            description="Create the first one above."
          />
        ) : (
          <div style={{ display: 'grid', gap: 'var(--s-1)', maxHeight: 320, overflowY: 'auto' }}>
            {users.map((u) => {
              const isSelf = currentUser?.id === u.id
              const isLastAdmin = u.role === 'admin' && adminCount <= 1
              const editing = editingId === u.id
              return (
                <div
                  key={u.id}
                  style={{
                    padding: 'var(--s-2)',
                    borderRadius: 'var(--r-2)',
                    background: 'var(--surface-2)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
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
                        {isSelf ? ' · you' : ''}
                      </div>
                      <div style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
                        {u.email}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="icon-btn"
                      style={{ marginLeft: 'auto' }}
                      aria-label={`Edit ${u.email}`}
                      aria-expanded={editing}
                      disabled={busy}
                      onClick={() => (editing ? cancelEdit() : startEdit(u))}
                    >
                      <Icon.Edit width={14} height={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn danger"
                      aria-label={`Delete ${u.email}`}
                      title={
                        isSelf
                          ? 'You cannot delete your own account'
                          : isLastAdmin
                            ? 'Cannot delete the last admin'
                            : undefined
                      }
                      disabled={busy || isSelf || isLastAdmin}
                      onClick={() => remove(u.id)}
                    >
                      <Icon.Trash width={14} height={14} />
                    </button>
                  </div>
                  {editing ? (
                    <div style={{ display: 'grid', gap: 'var(--s-2)', marginTop: 'var(--s-2)' }}>
                      <input
                        className="input"
                        type="password"
                        value={editPassword}
                        onChange={(e) => setEditPassword(e.target.value)}
                        placeholder="New password (leave blank to keep)"
                        aria-label={`New password for ${u.email}`}
                        autoComplete="new-password"
                      />
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--s-2)',
                          fontSize: 'var(--t-2xs)',
                          color: isLastAdmin ? 'var(--text-3)' : 'var(--text)',
                        }}
                        title={isLastAdmin ? 'Cannot demote the last admin' : undefined}
                      >
                        <input
                          type="checkbox"
                          checked={editRole === 'admin'}
                          disabled={isLastAdmin}
                          onChange={(e) => setEditRole(e.target.checked ? 'admin' : 'user')}
                        />
                        Admin (can manage other accounts)
                      </label>
                      <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
                        <button type="button" className="btn btn-soft" onClick={cancelEdit}>
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn btn-accent"
                          style={{ marginLeft: 'auto' }}
                          disabled={
                            busy ||
                            (editPassword.length === 0 && editRole === u.role) ||
                            (editPassword.length > 0 && editPassword.length < 8)
                          }
                          onClick={() => saveEdit(u)}
                        >
                          <Icon.Save width={14} height={14} />
                          {busy ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
