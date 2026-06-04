import { useState } from 'react'
import { AiError, generatePhotoreal, getAiKey, setAiKey } from '../../ai/aiClient'
import { captureCanvasPng } from '../../scene/captureCanvas'
import { useStore } from '../../state/store'
import { Icon } from '../toolbar/icons'

const STYLE_HINT: Record<string, string> = {
  clay: 'warm minimalist Singapore HDB interior',
  kampong: 'cozy tropical kampong-style interior with rattan and greenery',
  porcelain: 'bright airy scandinavian interior',
  estate: 'moody warm-industrial interior with timber and charcoal',
}

/**
 * "Make photoreal" — Workstream D. Sends a hi-fi snapshot of the current render
 * to a bring-your-own-key image-to-image model (Replicate by default) and shows
 * the photoreal result. Async + honest: no fast-turnaround promise, clear error
 * states, key stored only in localStorage. Experimental.
 */
export function AiPhotorealSection() {
  const theme = useStore((s) => s.theme)
  const [key, setKey] = useState(getAiKey())
  const [prompt, setPrompt] = useState(
    `${STYLE_HINT[theme] ?? 'modern interior'}, photorealistic, natural light, interior design photo`,
  )
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [msg, setMsg] = useState('')
  const [result, setResult] = useState<string | null>(null)

  const run = async () => {
    setAiKey(key.trim())
    const image = captureCanvasPng()
    if (!image) {
      setStatus('error')
      setMsg('Could not capture the current view.')
      return
    }
    setStatus('running')
    setMsg('Generating — this can take ~30s or more…')
    setResult(null)
    try {
      const url = await generatePhotoreal({ image, prompt })
      setResult(url)
      setStatus('done')
      setMsg('')
    } catch (e) {
      setStatus('error')
      setMsg(e instanceof AiError ? e.message : 'AI request failed.')
    }
  }

  return (
    <div className="sec">
      <div className="sec-h">
        <span>Make photoreal (AI · beta)</span>
      </div>
      <p
        className="panel-sub"
        style={{ textTransform: 'none', letterSpacing: 0, margin: '0 0 8px', lineHeight: 1.4 }}
      >
        Restyle the current view into a photoreal image with your own Replicate API key (kept only
        in this browser). Structure is preserved; results vary.
      </p>
      <div className="field" style={{ marginBottom: 6 }}>
        <Icon.Eye width={16} height={16} className="icn" />
        <input
          className="input"
          type="password"
          placeholder="Replicate API key (r8_…)"
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
      </div>
      <textarea
        className="input"
        rows={2}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        style={{ width: '100%', resize: 'vertical', marginBottom: 6 }}
      />
      <button
        type="button"
        className="btn btn-accent btn-block"
        disabled={status === 'running' || !key.trim()}
        onClick={run}
      >
        {status === 'running' ? 'Generating…' : 'Make photoreal'}
      </button>
      {msg && (
        <p
          className="panel-sub"
          style={{
            textTransform: 'none',
            letterSpacing: 0,
            marginTop: 8,
            color: status === 'error' ? 'var(--danger, #c0552e)' : 'var(--text-2)',
            lineHeight: 1.4,
          }}
        >
          {msg}
        </p>
      )}
      {result && (
        <div style={{ marginTop: 8 }}>
          <img
            src={result}
            alt="AI photoreal render"
            style={{ width: '100%', borderRadius: 'var(--r-2)', display: 'block' }}
          />
          <a
            href={result}
            target="_blank"
            rel="noreferrer"
            download="hdb-photoreal.png"
            className="btn btn-soft btn-sm btn-block"
            style={{ marginTop: 6 }}
          >
            <Icon.Download width={14} height={14} />
            Open / download
          </a>
        </div>
      )}
    </div>
  )
}
