import { useEffect, useState } from 'react'
import { withBase } from '../utils/assetUrl'

interface CreditEntry {
  id: string
  name: string
  attribution: string
  sourceUrl: string
  license: 'CC0' | 'CC-BY'
}

interface Credits {
  furniture: CreditEntry[]
  materials: CreditEntry[]
}

interface Props {
  open: boolean
  onClose: () => void
}

export function CreditsModal({ open, onClose }: Props) {
  const [credits, setCredits] = useState<Credits | null>(null)
  useEffect(() => {
    if (!open) return
    fetch(withBase('/assets/CREDITS.json'))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then(setCredits)
      .catch(() => setCredits({ furniture: [], materials: [] }))
  }, [open])
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="panel max-h-[80vh] w-full max-w-lg overflow-y-auto p-4 text-sm"
        style={{ color: 'var(--text)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="panel-title mb-2 text-lg">Asset credits</h2>
        {credits ? (
          <>
            <Section title="Furniture" entries={credits.furniture} />
            <Section title="Materials" entries={credits.materials} />
            {credits.furniture.length === 0 && credits.materials.length === 0 && (
              <div className="space-y-2" style={{ color: 'var(--text-2)' }}>
                <p>
                  All built-in furniture and finishes are{' '}
                  <span className="font-medium">generated procedurally on-device</span> — no
                  third-party assets are bundled, so none need attribution.
                </p>
                <p>
                  Assets you download from the in-app libraries (Poly Haven, ambientCG, Kenney — all
                  CC0) are credited on each item&rsquo;s catalog card.
                </p>
              </div>
            )}
          </>
        ) : (
          <p>Loading…</p>
        )}
        <button
          type="button"
          onClick={onClose}
          className="btn btn-soft"
          style={{ marginTop: 'var(--s-3)' }}
        >
          Close
        </button>
      </div>
    </div>
  )
}

function Section({ title, entries }: { title: string; entries: CreditEntry[] }) {
  if (!entries.length) return null
  return (
    <section className="mt-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="text-sm">
        {entries.map((e) => (
          <li key={e.id}>
            <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
              {e.name}
            </a>
            {' — '}
            {e.attribution} · {e.license}
          </li>
        ))}
      </ul>
    </section>
  )
}
