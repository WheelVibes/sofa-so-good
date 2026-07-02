/**
 * Usage circuit-breaker. On a cron schedule it queries the Cloudflare GraphQL
 * Analytics API for this month's R2 operations + storage and, if usage crosses
 * the configured trip fraction of the free allowance, sets `killswitch:r2` in
 * the shared FLAGS KV. The Pages API reads that flag and serves cache-only
 * (503 on cold miss) so NO new R2 reads occur — a self-imposed hard cap that
 * keeps the bill at $0. It clears the switch once usage drops below the warn
 * fraction (i.e. after the monthly reset).
 *
 * The GraphQL schema for R2 analytics can change; the query below is defensive
 * (failures leave the current switch untouched). Tune thresholds via vars.
 */

interface Env {
  FLAGS: KVNamespace
  CF_API_TOKEN: string
  CF_ACCOUNT_ID: string
  R2_CLASS_A_FREE: string
  R2_CLASS_B_FREE: string
  R2_STORAGE_FREE_GB: string
  TRIP_FRACTION: string
  WARN_FRACTION: string
}

const KILL_R2 = 'killswitch:r2'
const GRAPHQL = 'https://api.cloudflare.com/client/v4/graphql'

function num(v: string, fallback: number): number {
  const n = Number.parseFloat(v)
  return Number.isFinite(n) ? n : fallback
}

function monthStartUtc(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10)
}

interface R2Usage {
  classA: number
  classB: number
  storageBytes: number
}

async function fetchR2Usage(env: Env): Promise<R2Usage | null> {
  const since = monthStartUtc()
  const until = new Date().toISOString().slice(0, 10)
  const query = `
    query Usage($accountTag: String!, $since: Date!, $until: Date!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          ops: r2OperationsAdaptiveGroups(
            limit: 100
            filter: { date_geq: $since, date_leq: $until }
          ) {
            sum { requests }
            dimensions { actionType }
          }
          storage: r2StorageAdaptiveGroups(
            limit: 1
            orderBy: [datetime_DESC]
            filter: { date_geq: $since, date_leq: $until }
          ) {
            max { payloadSize metadataSize }
          }
        }
      }
    }`
  try {
    const res = await fetch(GRAPHQL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { accountTag: env.CF_ACCOUNT_ID, since, until },
      }),
    })
    if (!res.ok) return null
    const json = (await res.json()) as {
      data?: {
        viewer?: {
          accounts?: Array<{
            ops?: Array<{ sum?: { requests?: number }; dimensions?: { actionType?: string } }>
            storage?: Array<{ max?: { payloadSize?: number; metadataSize?: number } }>
          }>
        }
      }
    }
    const account = json.data?.viewer?.accounts?.[0]
    if (!account) return null
    // R2 Class A = mutating ops (Put/List/Delete...), Class B = read ops (Get/Head).
    const classBActions = new Set(['ReadObject', 'GetObject', 'HeadObject', 'ListObjects'])
    let classA = 0
    let classB = 0
    for (const g of account.ops ?? []) {
      const reqs = g.sum?.requests ?? 0
      if (classBActions.has(g.dimensions?.actionType ?? '')) classB += reqs
      else classA += reqs
    }
    const storage = account.storage?.[0]?.max
    const storageBytes = (storage?.payloadSize ?? 0) + (storage?.metadataSize ?? 0)
    return { classA, classB, storageBytes }
  } catch {
    return null
  }
}

async function evaluate(env: Env): Promise<void> {
  const usage = await fetchR2Usage(env)
  if (!usage) return // leave the switch as-is on any query failure

  const trip = num(env.TRIP_FRACTION, 0.95)
  const warn = num(env.WARN_FRACTION, 0.8)
  const classAFree = num(env.R2_CLASS_A_FREE, 1_000_000)
  const classBFree = num(env.R2_CLASS_B_FREE, 10_000_000)
  const storageFree = num(env.R2_STORAGE_FREE_GB, 10) * 1024 ** 3

  const fractions = [
    usage.classA / classAFree,
    usage.classB / classBFree,
    usage.storageBytes / storageFree,
  ]
  const peak = Math.max(...fractions)

  if (peak >= trip) {
    await env.FLAGS.put(KILL_R2, '1')
  } else if (peak < warn) {
    // Well under budget (e.g. after the monthly reset) — clear the switch.
    await env.FLAGS.delete(KILL_R2)
  }
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(evaluate(env))
  },
  // Manual trigger for testing: GET the worker URL to force an evaluation.
  async fetch(_req: Request, env: Env): Promise<Response> {
    await evaluate(env)
    const tripped = (await env.FLAGS.get(KILL_R2)) === '1'
    return Response.json({ evaluated: true, r2KillSwitch: tripped })
  },
}
