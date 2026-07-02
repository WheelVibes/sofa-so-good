# Admin credential management — design

**Date:** 2026-07-02
**Status:** approved (design), pending implementation plan
**Version target:** `0.10.0.1` (build bump on the Cloudflare backend line)

## Problem

The Cloudflare backend (v0.10.0.0) wires the login screen to real email + password
accounts, but credentials are effectively **write-once**:

- The first admin is created by `ensureAdminSeed()` from the `ADMIN_EMAIL` /
  `ADMIN_PASSWORD` secrets, but only if that email does not already exist. Rotating
  the secret afterwards does nothing.
- The **Manage accounts** modal (`UserManagementModal`) can only create, list, and
  delete accounts — there is no way to reset a password or change a role.

Result: once seeded, the admin password can only be changed by editing D1 by hand.

## Goal

Let a logged-in **admin** reset any account's **password** and change its **role**
(`user`↔`admin`) from the existing Manage accounts modal. Editing your own row is the
supported way to change the admin credentials. Any such change forces full session
revocation for the affected user.

### Non-goals (explicitly out of scope)

- Editing the login **email** (it stays fixed as the account identity).
- Editing the **display name**.
- **Self-service** credential change for non-admin users.
- A new deploy-time **re-seed / reset** path. The first admin still comes from the
  `ADMIN_EMAIL` / `ADMIN_PASSWORD` seed; docs will make this explicit.

Unchanged: login flow, Turnstile, session cookie shape, guardrails / kill-switches.

## Design

### 1. Session revocation — per-user token index

Sessions today are opaque `sess:<token>` KV entries with no reverse lookup, so "revoke
all sessions for user X" is impossible. Add a per-user index:

- **KV key** `usess:<userId>` → `{ tokens: string[] }`, written with TTL = the max
  session TTL (`SESSION_TTL_SECONDS`), refreshed on each login.
- `createSession(env, userId, role)`: after writing `sess:<token>`, read the index,
  append `token`, write it back.
- `destroySession(env, token)`: delete `sess:<token>`; also remove `token` from the
  owner's index. (The record is read first to learn the `userId`.)
- New `revokeUserSessions(env, userId)`: read `usess:<userId>`, delete every listed
  `sess:<token>`, then delete the index key.

**Read budget:** the hot path (`readSession` on every request) still does exactly **one**
KV read. Extra KV **writes** occur only on login / logout / revoke — rare, well under the
1,000 writes/day free cap.

**Trade-off / accepted risk:** the index is a read-modify-write, so two truly
simultaneous logins for the same user could drop one token from the list (that session
would then not be force-revocable, though it still expires normally). Acceptable for a
low-concurrency, few-account deployment. `revokeUserSessions` also deletes the caller's
current token directly as a backstop for the common self-edit case.

Stale tokens (whose `sess:` entry already expired) may linger in the index; deleting a
non-existent key is a harmless no-op, and the index key itself carries the session TTL.

### 2. API — `PATCH /api/admin/users/:id`

Admin-gated by the existing `/admin/*` middleware. Body `{ password?: string; role?: 'user' | 'admin' }`,
both optional (at least one required).

- `password` present → must be ≥ 8 chars (mirrors create); re-hash with PBKDF2
  (`hashPassword`, iterations from `PBKDF2_ITERATIONS`) and update the row.
- `role` present → validate ∈ {`user`,`admin`}; update the row.
- **Last-admin guard:** demoting the last remaining `admin` → `409`. Also extend
  `DELETE /admin/users/:id` to refuse deleting the last admin.
- On success → `revokeUserSessions(id)`.
- **Self-edit exception:** if `id` equals the caller's session `userId` **and** the
  password changed, after revoking, mint a fresh session and set a new `Set-Cookie` on
  the response so the acting admin stays logged in (their *other* sessions still die).
  A self role change is not expected (an admin editing their own role is only allowed if
  another admin remains), but if it happens the re-minted session carries the new role.

Validation errors return `4xx` JSON `{ error }` consistent with the existing routes.

### 3. Server DB helpers (`server/db.ts`)

- `updateUserPassword(env, id, password)` — re-hash + `UPDATE users SET password_hash, password_salt, iterations`.
- `updateUserRole(env, id, role)` — `UPDATE users SET role`.
- `countAdmins(env)` — `SELECT COUNT(*) WHERE role = 'admin'`.

No schema change: `users` already has `password_hash`, `password_salt`, `iterations`, `role`.

### 4. Frontend — `UserManagementModal`

- Each account row gains an **Edit** toggle that expands inline fields:
  - new-password input (placeholder "Leave blank to keep"; blank = unchanged),
  - role checkbox (Admin),
  - **Save** (calls `PATCH /admin/users/:id`) and **Cancel**.
- Editing **your own** row: on success call `refreshAuth()` so `currentUser`
  (role/label) stays correct; the server has already re-minted the session cookie.
- Show a subtle "you" marker on the caller's own row (via `currentUser.id`).
- The last admin's role checkbox is disabled with an explanatory title; server enforces
  the guard regardless.
- **UI approach:** inline-expand within the existing row, chosen over a separate edit
  sub-modal — less UI surface, no extra overlay layer, fits the compact panel.

All styling uses the existing token classes (`.btn`, `.input`, `.panel`, `--s-*`); no
hardcoded colours.

### 5. Flags

No new feature flag. This is part of the existing `accounts` feature, which is already
flag-gated and admin-gated (client `useFeature` + server `/admin/*` role check).

## Data flow

1. Admin opens Manage accounts → `GET /admin/users` (unchanged).
2. Admin clicks Edit on a row, sets a new password and/or role, Save.
3. `PATCH /admin/users/:id` → validate → last-admin guard → update D1 → `revokeUserSessions`.
4. If self + password changed → mint new session, `Set-Cookie`.
5. Client `refresh()`es the list; if self, also `refreshAuth()`.
6. The edited user's old cookies now resolve to `null` session → they are logged out and
   must sign in with the new password.

## Error handling

- `400` — no fields provided, or password < 8 chars.
- `403` — non-admin (existing middleware).
- `404` — unknown user id.
- `409` — would demote / delete the last admin.
- Client surfaces `ApiError.message` inline in the modal (existing pattern).

## Testing

Server (vitest + worker env):
- password reset re-hashes and old password fails / new password verifies;
- role change persists;
- last-admin demotion and last-admin delete both blocked (`409`);
- `revokeUserSessions` empties the index and the `sess:` keys;
- self password edit re-mints a valid session (caller stays authenticated).

Client:
- `UserManagementModal` renders the Edit affordance and disables the last-admin role
  toggle; a Save posts the expected `PATCH` body (mocked `apiFetch`).

Both-mode gating is already covered by the existing `accounts` flag tests; no new
mode-specific behaviour is introduced.

## Docs & version

- `docs/deployment-cloudflare.md`: state that the initial admin comes from the seed
  secrets for the first login, and that passwords/roles are rotated **in-app** afterwards
  (changing the secret does not rotate an existing admin).
- `CHANGELOG.md`: add the `0.10.0.1` entry.
- Bump `src/version.ts` → `0.10.0.1` and `package.json` → `0.10.0` (mirror unchanged;
  build bumps don't change the three-part mirror).
- Visual-verify the Manage-accounts edit flow per `docs/visual-verification-playbook.md`.
