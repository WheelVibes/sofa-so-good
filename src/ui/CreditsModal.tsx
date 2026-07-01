import { useEffect, useState } from 'react'
import { withBase } from '../utils/assetUrl'
import { safeUrl } from '../utils/safeUrl'
import { Modal } from './Modal'

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
  // Built on the shared Modal primitive so it gets Escape-to-close, a focus
  // trap + focus restore, `role="dialog"`/`aria-modal`, and the global hotkey
  // guard for free (A11Y — it was previously a bare overlay lacking all of these).
  return (
    <Modal open={open} onClose={onClose} title="Asset credits" width={512}>
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
    </Modal>
  )
}

function Section({ title, entries }: { title: string; entries: CreditEntry[] }) {
  if (!entries.length) return null
  return (
    <section className="mt-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="text-sm">
        {entries.map((e) => {
          const href = safeUrl(e.sourceUrl)
          return (
            <li key={e.id}>
              {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
                  {e.name}
                </a>
              ) : (
                <span>{e.name}</span>
              )}
              {' — '}
              {e.attribution} · {e.license}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
