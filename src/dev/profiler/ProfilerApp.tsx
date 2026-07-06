import { useEffect, useMemo, useState } from 'react'
import type { EffectCost, MetricsSnapshot, ObjectCost, ProfilerApi } from './profilerTypes'

function api(): ProfilerApi | null {
  return (window.opener as unknown as { __profiler?: ProfilerApi })?.__profiler ?? null
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  )
}

/** Tiny inline SVG sparkline of recent frame times. */
function Sparkline({ history }: { history: MetricsSnapshot['history'] }) {
  const pts = useMemo(() => {
    if (history.length < 2) return ''
    const vals = history.map((h) => h.frameMs)
    const max = Math.max(33, ...vals)
    return history
      .map((h, i) => {
        const x = (i / (history.length - 1)) * 100
        const y = 40 - (h.frameMs / max) * 40
        return `${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')
  }, [history])
  return (
    <svg className="profiler-spark" viewBox="0 0 100 40" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

function LiveTab({ snap }: { snap: MetricsSnapshot | null }) {
  const s = snap?.latest
  if (!s) return <p>Waiting for frames… interact with the scene to sample.</p>
  return (
    <div>
      <Sparkline history={snap!.history} />
      <dl className="profiler-grid">
        <Metric label="Tier" value={snap!.tier} />
        <Metric label="FPS" value={s.continuous ? Math.round(s.fps) : 'idle'} />
        <Metric label="Frame" value={`${s.frameMs.toFixed(1)} ms`} />
        <Metric label="Draw calls" value={s.calls} />
        <Metric label="Triangles" value={s.triangles.toLocaleString()} />
        <Metric label="Geometries" value={s.geometries} />
        <Metric label="Textures" value={s.textures} />
        <Metric label="Lights" value={s.lights} />
        <Metric label="JS heap" value={s.heapMB == null ? 'n/a' : `${s.heapMB} MB`} />
      </dl>
    </div>
  )
}

function CostTab() {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState('')
  const [rows, setRows] = useState<EffectCost[]>([])
  const run = async () => {
    const a = api()
    if (!a) return
    setRunning(true)
    setRows([])
    try {
      const out = await a.runCostBreakdown((done, total, label) =>
        setProgress(`${done}/${total} — ${label}`),
      )
      setRows(out)
    } finally {
      setRunning(false)
      setProgress('')
    }
  }
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.deltaMs)))
  return (
    <div>
      <button type="button" className="btn" disabled={running} onClick={run}>
        {running ? `Running… ${progress}` : 'Run cost breakdown'}
      </button>
      <p style={{ opacity: 0.7 }}>The viewport will flicker while each effect is toggled.</p>
      {rows.map((r) => (
        <div key={r.key} className="profiler-row">
          <span>{r.label}</span>
          <span>
            {r.deltaMs >= 0 ? '−' : '+'}
            {Math.abs(r.deltaMs).toFixed(1)} ms/frame ({r.fpsGain >= 0 ? '+' : ''}
            {Math.round(r.fpsGain)} fps)
          </span>
          <div
            className="profiler-bar"
            style={{ width: `${(Math.abs(r.deltaMs) / max) * 100}%` }}
          />
        </div>
      ))}
    </div>
  )
}

function ObjectsTab() {
  const [rows, setRows] = useState<ObjectCost[]>([])
  const scan = () => setRows(api()?.getObjectBreakdown() ?? [])
  return (
    <div>
      <button type="button" className="btn" onClick={scan}>
        Scan scene objects
      </button>
      {rows.map((r) => (
        <button
          type="button"
          key={r.itemId}
          className="profiler-row"
          onClick={() => api()?.selectItem(r.itemId)}
          title="Select in main window"
        >
          <span>{r.name}</span>
          <span>
            {r.triangles.toLocaleString()} tris · {r.meshes} mesh · {r.materials} mat
          </span>
        </button>
      ))}
    </div>
  )
}

export function ProfilerApp() {
  const [tab, setTab] = useState<'live' | 'cost' | 'objects'>('live')
  const [snap, setSnap] = useState<MetricsSnapshot | null>(null)

  useEffect(() => {
    const a = api()
    if (!a) return
    setSnap(a.getSnapshot())
    return a.subscribe(setSnap)
  }, [])

  return (
    <div>
      <div className="profiler-tabs">
        {(['live', 'cost', 'objects'] as const).map((t) => (
          <button
            type="button"
            key={t}
            className="btn"
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'live' ? <LiveTab snap={snap} /> : null}
      {tab === 'cost' ? <CostTab /> : null}
      {tab === 'objects' ? <ObjectsTab /> : null}
    </div>
  )
}
