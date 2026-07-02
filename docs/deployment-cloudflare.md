# Deploying to Cloudflare (Pages + Workers, free tier)

This guide deploys Sofa So Good to Cloudflare as a **Pages** site (the static
Vite build) plus a same-origin **Pages Function** API (Workers) bound to **D1**
(accounts, saved layouts, favourites), **R2** (the shared, read-only asset
library), and **KV** (sessions, cache, kill-switch flags). It also ships a
standalone **cron Worker** that acts as a cost circuit-breaker.

The existing **GitHub Pages** deployment keeps working unchanged as a free,
account-less, fully-offline demo — see [GitHub Pages coexistence](#github-pages-coexistence).

- [Architecture](#architecture)
- [What you set up manually](#what-you-set-up-manually-one-time)
- [Provision resources](#provision-resources-wrangler)
- [Configure secrets + bindings](#configure-secrets--bindings)
- [Apply the database schema](#apply-the-database-schema)
- [Populate R2 with the shared library](#populate-r2-with-the-shared-library)
- [Build + deploy the site](#build--deploy-the-site)
- [Deploy the circuit-breaker cron Worker](#deploy-the-circuit-breaker-cron-worker)
- [Cost safety + guardrails](#cost-safety--guardrails)
- [GitHub Pages coexistence](#github-pages-coexistence)
- [Local development against the API](#local-development-against-the-api)

## Architecture

```mermaid
flowchart TD
  Browser["Browser (React app)"]
  Pages["Cloudflare Pages (static dist/)"]
  Fn["Pages Function API (functions/api/[[route]].ts, Hono)"]
  D1[("D1 - users, designs, favourites")]
  KV[("KV - SESSIONS / CACHE / FLAGS")]
  R2[("R2 - shared asset library (private)")]
  Cron["Cron Worker (workers/usage-monitor)"]

  Browser -->|"static assets"| Pages
  Browser -->|"/api/* (cookies)"| Fn
  Fn --> D1
  Fn --> KV
  Fn -->|"auth-gated + Cache API"| R2
  Cron -->|"reads GraphQL analytics"| CFAPI["Cloudflare Analytics API"]
  Cron -->|"trips killswitch:r2"| KV
  Fn -->|"reads killswitch"| KV
```

- **Accounts are admin-created only** — there is no public signup. The first
  admin is seeded from secrets; that admin creates everyone else in-app.
- **The R2 bucket stays private** (Worker-only). Assets are served through the
  auth-gated `/api/assets/*` proxy with a long immutable cache, so repeat loads
  are served by the browser / service worker / edge cache and rarely hit R2.

## What you set up manually (one-time)

1. **Create a Cloudflare account** at <https://dash.cloudflare.com/sign-up> (free).
2. **Enable R2.** In the dashboard, go to **R2** and complete the one-time
   activation. R2 requires a payment method on file even on the free tier — the
   [guardrails](#cost-safety--guardrails) below are designed so you never exceed
   the free allowance.
3. **Set a budget alert (recommended).** Billing → Notifications → create an
   alert at your lowest supported threshold so any unexpected spend pings you.
4. **Install Wrangler + log in:**
   ```bash
   npm install                     # wrangler is a devDependency
   npx wrangler login
   ```
5. **(Optional) Custom domain.** Pages gives you `your-project.pages.dev` for
   free. To use your own domain, add it as a **Zone** in Cloudflare (or transfer
   DNS), then Pages → your project → **Custom domains** → add it. Full control of
   subdomain/apex; TLS is automatic.
6. **(Optional) Turnstile (CAPTCHA on login).** Dashboard → **Turnstile** → add a
   widget for your domain. Note the **site key** (public, goes in the frontend
   env) and the **secret** (goes in a Worker secret). Skipping this disables the
   CAPTCHA (fine for a low-traffic private deployment).

## Provision resources (Wrangler)

Each command prints an id — paste it into [`wrangler.toml`](../wrangler.toml).

```bash
npx wrangler d1 create sofa-db
npx wrangler r2 bucket create sofa-assets
npx wrangler kv namespace create SESSIONS
npx wrangler kv namespace create CACHE
npx wrangler kv namespace create FLAGS
```

Fill the placeholders in `wrangler.toml`:
- `database_id` under `[[d1_databases]]`
- `id` under each `[[kv_namespaces]]`

The R2 bucket is referenced by name, so no id is needed there.

## Configure secrets + bindings

Secrets are set per-project and never committed:

```bash
# First-admin seed (created automatically on first API request)
npx wrangler pages secret put ADMIN_EMAIL
npx wrangler pages secret put ADMIN_PASSWORD
# Turnstile (only if you created a widget above)
npx wrangler pages secret put TURNSTILE_SECRET
```

Non-secret tunables live in `wrangler.toml` `[vars]` (iterations, session TTL,
`MAX_ACCOUNTS`, `MAX_SLOTS_PER_USER`, `MAX_DESIGN_BYTES`) and can be changed
without touching code.

Frontend build env (Cloudflare Pages → Settings → Environment variables, or a
local `.env` — see [`.env.example`](../.env.example)):

| Variable | Value | Effect |
| --- | --- | --- |
| `VITE_API_BASE` | `/api` | Turns on accounts + cloud sync (`hasBackend()`). |
| `VITE_BASE` | `/` | Serve at the site root (GitHub Pages uses `/sofa-so-good/`). |
| `VITE_TURNSTILE_SITE_KEY` | your site key | Shows the login CAPTCHA. |

## Apply the database schema

```bash
npx wrangler d1 migrations apply sofa-db --remote
```

Schema: [`migrations/0001_init.sql`](../migrations/0001_init.sql) — `users`,
`designs` (JSON of the client `SerializedState`), `favourites`.

## Populate R2 with the shared library

R2 holds a **read-only shared library that you populate once from your machine**.
There is **no write path from the app into R2** — in-app user uploads stay local
in the browser (IndexedDB), so R2 growth is entirely under your control.

1. Build the manifest the app fetches:
   ```bash
   npm run build-library-index          # scans ikea_optimized/ -> ikea_optimized/library-index.json
   ```
2. Upload the tree + manifest. Configure an `rclone` remote for R2 (S3-compatible;
   endpoint `https://<accountid>.r2.cloudflarestorage.com`) or use `aws s3`:
   ```bash
   # objects land at ikea/<group>/... and library/index.json (the keys the proxy serves)
   rclone copy ikea_optimized r2:sofa-assets/ikea --transfers=32 --checkers=32 \
     --exclude 'library-index.json'
   rclone copyto ikea_optimized/library-index.json r2:sofa-assets/library/index.json
   ```
   The proxy maps `/api/assets/ikea/<group>/<file>` → the R2 key
   `ikea/<group>/<file>`, and `/api/assets/library/index.json` → `library/index.json`.

> **Licensing.** The IKEA library is non-redistributable, so R2 serves it **only
> to signed-in users** through the auth gate — it is never public. Keep the
> bucket private.

## Build + deploy the site

Cloudflare's build automatically bundles `functions/` into the API Worker.

```bash
VITE_API_BASE=/api VITE_BASE=/ npm run build
npx wrangler pages deploy dist --project-name sofa-so-good
```

Or connect the Git repo in the Pages dashboard with build command
`npm run build`, output `dist`, and the env vars above — every push deploys.

## Deploy the circuit-breaker cron Worker

Pages Functions cannot run scheduled/cron handlers, so the usage monitor ships as
its own Worker.

1. Point its KV `id` at the **same** `FLAGS` namespace and set `CF_ACCOUNT_ID` in
   [`workers/usage-monitor/wrangler.toml`](../workers/usage-monitor/wrangler.toml).
2. Create an API token (dashboard → My Profile → API Tokens) with **Account
   Analytics: Read**, then:
   ```bash
   cd workers/usage-monitor
   npx wrangler secret put CF_API_TOKEN
   npx wrangler deploy
   ```

It polls R2 usage every 4 hours and sets `killswitch:r2` in KV when usage crosses
`TRIP_FRACTION` of the free allowance; it clears it after the monthly reset.

## Cost safety + guardrails

Multiple independent layers keep the bill at **$0**:

- **Private bucket + auth gate.** R2 is Worker-only and served only to signed-in
  users; no public signup means no anonymous fan-out.
- **Cache-first reads.** Assets carry `immutable` cache headers and are fronted by
  the Worker Cache API, so repeat reads rarely reach R2 (Class B ops guardrail).
- **Self-imposed circuit breaker.** The cron Worker trips `killswitch:r2` at
  ~95% of the free R2 allowance. When tripped, `/api/assets/*` serves cache-only
  and returns `503` on a cold miss — **zero new R2 reads** until the monthly reset
  clears it.
- **Manual master kill-switch.** Set `killswitch:all=1` in the `FLAGS` KV to
  return `503` for the whole API instantly:
  ```bash
  npx wrangler kv key put --binding FLAGS killswitch:all 1
  # or just R2:
  npx wrangler kv key put --binding FLAGS killswitch:r2 1
  ```
- **Write-budget discipline (D1/KV free caps).** Cloud autosave is throttled to
  ≤1 write/60 s (still saved locally every change); login writes a single KV
  session key; per-user caps on saved slots (`MAX_SLOTS_PER_USER`) and design
  size (`MAX_DESIGN_BYTES`); account cap (`MAX_ACCOUNTS`).
- **Graceful degradation.** Every cloud write falls back to local storage on
  error, so hitting a free cap never blocks the user — they keep working offline
  and sync catches up later.
- **Abuse guards.** Turnstile on login, best-effort per-isolate rate limiting on
  `/api/auth` + `/api/assets`, and (recommended) a Cloudflare **WAF rate-limiting**
  rule on `/api/auth/*` and `/api/assets/*` in the dashboard.

## GitHub Pages coexistence

The GitHub Pages workflow is unchanged. Because the client gates all backend
features on `VITE_API_BASE` (`hasBackend()`), a build without it (GitHub Pages)
has **no cloud login, no cloud sync, and no shared-library browser** — it stays
the existing local-only, offline PWA. The Cloudflare build (with `VITE_API_BASE`
set) is the full-featured version.

## Local development against the API

Run the Pages Function + bindings locally with Wrangler's Pages dev server:

```bash
npm run build
npx wrangler pages dev dist --d1 DB=sofa-db --kv SESSIONS --kv CACHE --kv FLAGS --r2 LIBRARY=sofa-assets
```

Turnstile verification is skipped when `TURNSTILE_SECRET` is unset, so local login
works with just an email + password. Point the Vite dev server at a running API
with `VITE_API_BASE` if you want the two split during development.
