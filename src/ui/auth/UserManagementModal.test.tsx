// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../../state/store'
import { UserManagementModal } from './UserManagementModal'

vi.mock('../../features/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/api/client')>()
  return { ...actual, apiFetch: vi.fn() }
})

const { apiFetch } = await import('../../features/api/client')
const mockApiFetch = apiFetch as unknown as ReturnType<typeof vi.fn>

const USERS = [
  {
    id: 'admin1',
    email: 'admin@b.com',
    name: 'Admin',
    role: 'admin' as const,
    createdAt: '2026-01-01',
  },
  {
    id: 'user1',
    email: 'user@b.com',
    name: 'User',
    role: 'user' as const,
    createdAt: '2026-01-02',
  },
]

beforeEach(() => {
  mockApiFetch.mockReset()
  mockApiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === '/admin/users' && !init) return { users: USERS }
    return {}
  })
  useStore.setState({
    currentUser: { id: 'admin1', name: 'Admin', role: 'admin' as const },
    refreshAuth: async () => {},
  })
})

describe('UserManagementModal editing', () => {
  it('disables the role toggle for the last admin when editing', async () => {
    render(<UserManagementModal onClose={() => {}} />)
    await waitFor(() => expect(screen.getByLabelText('Edit admin@b.com')).toBeTruthy())

    fireEvent.click(screen.getByLabelText('Edit admin@b.com'))

    // The create form has an (enabled) Admin checkbox; the only DISABLED checkbox
    // is the last-admin role toggle in the expanded edit row.
    const disabled = screen.getAllByRole('checkbox').filter((c) => (c as HTMLInputElement).disabled)
    expect(disabled).toHaveLength(1)
  })

  it('PATCHes the expected body when resetting a user password', async () => {
    render(<UserManagementModal onClose={() => {}} />)
    await waitFor(() => expect(screen.getByLabelText('Edit user@b.com')).toBeTruthy())

    fireEvent.click(screen.getByLabelText('Edit user@b.com'))
    fireEvent.change(screen.getByLabelText('New password for user@b.com'), {
      target: { value: 'newpassword123' },
    })
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/admin/users/user1', {
        method: 'PATCH',
        body: JSON.stringify({ password: 'newpassword123' }),
      }),
    )
  })
})
