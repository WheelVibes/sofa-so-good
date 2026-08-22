import { useReducer, useRef, useState } from 'react'
import { AiError, generatePhotoreal, getAiKey, setAiKey } from '../../ai/aiClient'
import { buildVariantPrompt, defaultPhotorealPrompt, STYLE_VARIANTS } from '../../ai/styleVariants'
import { captureCanvasPng } from '../../scene/captureCanvas'
import { useStore } from '../../state/store'
import { ShimmerText } from '../controls/ShimmerText'
import { Icon } from '../toolbar/icons'
import { EMPTY_GALLERY, galleryReducer, ORIGINAL_ID, selectedEntry } from './variantGallery'

const subStyle = {
  lineHeight: 1.4,
} as const

/**
 * "Make photoreal" + "Redesign this render" — Workstream D / F27. Sends a
 * hi-fi snapshot of the current render to a bring-your-own-key image-to-image
 * model (Replicate by default) and shows the photoreal result. Once one
 * exists, style chips re-run the SAME call on the SAME snapshot with a
 * style-modified prompt (ai/styleVariants), building a small selectable /
 * downloadable gallery (variantGallery reducer). Async + honest: no
 * fast-turnaround promise, clear error states, key stored only in
 * localStorage. Experimental.
 */
export function AiPhotorealSection() {
  const theme = useStore((s) => s.theme)
  const [key, setKey] = useState(getAiKey())
  const [prompt, setPrompt] = useState(defaultPhotorealPrompt(theme))
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [msg, setMsg] = useState('')
  const [gallery, dispatch] = useReducer(galleryReducer, EMPTY_GALLERY)
  // The snapshot + prompt that produced the original — every variant restyles
  // THESE (not a re-capture / an edited textarea), so the gallery is a fair
  // apples-to-apples comparison of one view.
  const sourceRef = useRef<{ image: string; prompt: string } | null>(null)

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
    dispatch({ type: 'reset' })
    sourceRef.current = { image, prompt }
    try {
      const url = await generatePhotoreal({ image, prompt })
      dispatch({ type: 'seed', url })
      setStatus('done')
      setMsg('')
    } catch (e) {
      setStatus('error')
      setMsg(e instanceof AiError ? e.message : 'AI request failed.')
    }
  }

  const runVariant = async (style: (typeof STYLE_VARIANTS)[number]) => {
    const source = sourceRef.current
    if (!source || gallery.pendingId) return
    dispatch({ type: 'start', id: style.id })
    try {
      const url = await generatePhotoreal({
        image: source.image,
        prompt: buildVariantPrompt(source.prompt, style),
      })
      dispatch({ type: 'success', id: style.id, label: style.label, url })
    } catch (e) {
      dispatch({
        type: 'fail',
        id: style.id,
        message: e instanceof AiError ? e.message : 'AI request failed.',
      })
    }
  }

  const selected = selectedEntry(gallery)

  return (
    <div className="sec">
      <div className="sec-h">
        <span>Make photoreal (AI · beta)</span>
      </div>
      <p className="panel-sub plain" style={{ ...subStyle, margin: '0 0 8px' }}>
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
        {status === 'running' ? <ShimmerText>Generating…</ShimmerText> : 'Make photoreal'}
      </button>
      {msg && (
        <p
          className="panel-sub plain"
          style={{
            ...subStyle,
            marginTop: 8,
            color: status === 'error' ? 'var(--danger)' : 'var(--text-2)',
          }}
        >
          {msg}
        </p>
      )}
      {selected && (
        <div style={{ marginTop: 8 }}>
          <img
            src={selected.url}
            alt={
              selected.id === ORIGINAL_ID
                ? 'AI photoreal render'
                : `AI photoreal render — ${selected.label} restyle`
            }
            style={{ width: '100%', borderRadius: 'var(--r-2)', display: 'block' }}
          />
          {gallery.entries.length > 1 && (
            <div
              role="listbox"
              aria-label="Generated variants"
              style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}
            >
              {gallery.entries.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  role="option"
                  aria-selected={e.id === gallery.selectedId}
                  title={e.label}
                  onClick={() => dispatch({ type: 'select', id: e.id })}
                  style={{
                    padding: 0,
                    border:
                      e.id === gallery.selectedId
                        ? '2px solid var(--accent)'
                        : '2px solid transparent',
                    borderRadius: 'var(--r-2)',
                    background: 'none',
                    cursor: 'pointer',
                    lineHeight: 0,
                  }}
                >
                  <img
                    src={e.url}
                    alt={e.label}
                    style={{
                      width: 56,
                      height: 42,
                      objectFit: 'cover',
                      borderRadius: 'calc(var(--r-2) - 2px)',
                      display: 'block',
                    }}
                  />
                </button>
              ))}
            </div>
          )}
          <p className="panel-sub plain" style={{ ...subStyle, margin: '8px 0 4px' }}>
            Redesign this render — same view, another style:
          </p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {STYLE_VARIANTS.map((s) => {
              const pending = gallery.pendingId === s.id
              const has = gallery.entries.some((e) => e.id === s.id)
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`chip${gallery.selectedId === s.id ? ' on' : ''}`}
                  disabled={gallery.pendingId !== null}
                  aria-label={`Redesign as ${s.label}`}
                  // First click generates; a later click selects the existing
                  // result; clicking the already-selected chip regenerates it.
                  onClick={() =>
                    has && gallery.selectedId !== s.id
                      ? dispatch({ type: 'select', id: s.id })
                      : runVariant(s)
                  }
                  style={{ cursor: 'pointer' }}
                >
                  {pending ? `${s.label}…` : s.label}
                </button>
              )
            })}
          </div>
          {gallery.pendingId && (
            <p
              className="panel-sub plain"
              style={{ ...subStyle, marginTop: 6, color: 'var(--text-2)' }}
            >
              Generating the {STYLE_VARIANTS.find((s) => s.id === gallery.pendingId)?.label} restyle
              — this can take ~30s or more…
            </p>
          )}
          {gallery.error && (
            <p
              className="panel-sub plain"
              style={{ ...subStyle, marginTop: 6, color: 'var(--danger)' }}
            >
              {gallery.error}
            </p>
          )}
          <a
            href={selected.url}
            target="_blank"
            rel="noreferrer"
            download={`hdb-photoreal-${selected.id}.png`}
            className="btn btn-soft btn-sm btn-block"
            style={{ marginTop: 8 }}
          >
            <Icon.Download width={14} height={14} />
            Open / download {selected.label !== 'Original' ? `(${selected.label})` : ''}
          </a>
        </div>
      )}
    </div>
  )
}
