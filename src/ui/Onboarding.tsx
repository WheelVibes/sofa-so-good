import { createPortal } from 'react-dom'
import { useModalGuard } from '../controls/modalGuard'
import { firstEditableRoomId } from '../state/rooms'
import { useStore } from '../state/store'
import { BrandMark } from './Logo'
import { Icon, type IconName } from './toolbar/icons'

const ONBOARDED_KEY = 'hdb_onboarded'

function markOnboarded() {
  try {
    localStorage.setItem(ONBOARDED_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function hasOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === '1'
  } catch {
    return false
  }
}

const FEATURES: { icon: IconName; title: string; sub: string }[] = [
  { icon: 'Catalog', title: 'Furnish', sub: 'Drag from a rich furniture catalog' },
  { icon: 'Palette', title: 'Refinish', sub: 'Repaint walls & swap flooring' },
  { icon: 'Walk', title: 'Walk through', sub: 'Feel the scale at eye level' },
]

const TOUR: { icon: IconName; title: string; sub: string }[] = [
  {
    icon: 'Cube',
    title: 'Edit a room',
    sub: 'Click a room (or the Edit a room button) to design it — the overview is just for looking.',
  },
  {
    icon: 'Catalog',
    title: 'Furnish & arrange',
    sub: 'Inside a room, drag catalog items onto the floor; click to move, R to rotate.',
  },
  {
    icon: 'Palette',
    title: 'Refinish surfaces',
    sub: 'In the room, click a wall or the floor to change its finish.',
  },
  { icon: 'Walk', title: 'Walk it', sub: 'Switch to Walk to experience the flat at eye level.' },
]

/** First-run onboarding carousel (3 steps): welcome → quick tour → choose a
 *  starting point. Persists completion in localStorage. */
export function Onboarding() {
  const open = useStore((s) => s.onboardingOpen)
  const step = useStore((s) => s.onboardingStep)
  const setOpen = useStore((s) => s.setOnboardingOpen)
  const setStep = useStore((s) => s.setOnboardingStep)

  // Modal-style overlay: suppress global shortcuts while open.
  useModalGuard(open)

  if (!open) return null

  const finish = () => {
    markOnboarded()
    setOpen(false)
    setStep(0)
  }

  const choose = (kind: 'catalog' | 'demo' | 'empty' | 'smart' | 'tour') => {
    const s = useStore.getState()
    if (kind === 'empty') s.resetToEmpty()
    else if (kind === 'demo') s.resetToDefault()
    else if (kind === 'catalog') {
      // Furnishing happens in the per-room editor now, so dive into a room with
      // the catalog open (rather than opening it in the view-only overview,
      // where the drawer doesn't mount).
      s.resetToDefault()
      const st = useStore.getState()
      const roomId = firstEditableRoomId(st.floorPlan)
      if (roomId) st.enterRoomEditor(roomId)
      st.setLeftMode('catalog')
      st.setCatalogOpen(true)
    } else if (kind === 'smart') {
      s.setSmartStartOpen(true)
    } else if (kind === 'tour') {
      // Load the demo flat so the tour highlights a real, furnished design, then
      // launch the guided walkthrough.
      s.resetToDefault()
      finish()
      s.startTour()
      return
    }
    finish()
  }

  return createPortal(
    <div className="modal-overlay onb-overlay">
      <div className="panel onb-card">
        <div className="onb-content">
          {step === 0 && (
            <div className="onb-hero">
              <div className="onb-mark">
                <BrandMark size={32} />
              </div>
              <h2 className="onb-title">Welcome to Sofa So Good</h2>
              <p className="onb-lede">
                Design your home in the browser — start from the furnished 4-room HDB or your own
                plan, furnish it, refinish the walls and floors, then walk through the result.
              </p>
              <div className="onb-feats">
                {FEATURES.map((f) => {
                  const Glyph = Icon[f.icon]
                  return (
                    <div className="onb-feat" key={f.title}>
                      <span className="onb-feat-ic">
                        <Glyph width={20} height={20} />
                      </span>
                      <b>{f.title}</b>
                      <em>{f.sub}</em>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="onb-body2">
              <h2 className="onb-title sm">A quick tour</h2>
              <ul className="onb-steps">
                {TOUR.map((t) => {
                  const Glyph = Icon[t.icon]
                  return (
                    <li key={t.title}>
                      <span className="onb-step-ic">
                        <Glyph width={18} height={18} />
                      </span>
                      <div>
                        <b>{t.title}</b>
                        <em>{t.sub}</em>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {step === 2 && (
            <div className="onb-body3">
              <h2 className="onb-title sm">Where would you like to start?</h2>
              <div className="onb-choices">
                <button type="button" className="onb-choice" onClick={() => choose('tour')}>
                  <span className="onb-choice-ic">
                    <Icon.Help width={20} height={20} />
                  </span>
                  <div>
                    <b>Take the guided tour</b>
                    <em>New here? A 7-step walkthrough of the essentials</em>
                  </div>
                  <Icon.ChevronRight width={18} height={18} />
                </button>
                <button type="button" className="onb-choice" onClick={() => choose('smart')}>
                  <span className="onb-choice-ic">
                    <Icon.Palette width={20} height={20} />
                  </span>
                  <div>
                    <b>Smart Start</b>
                    <em>Pick a style — we furnish &amp; finish every room</em>
                  </div>
                  <Icon.ChevronRight width={18} height={18} />
                </button>
                <button type="button" className="onb-choice" onClick={() => choose('catalog')}>
                  <span className="onb-choice-ic">
                    <Icon.Catalog width={20} height={20} />
                  </span>
                  <div>
                    <b>Browse the catalog</b>
                    <em>Jump into a room with the catalog open</em>
                  </div>
                  <Icon.ChevronRight width={18} height={18} />
                </button>
                <button type="button" className="onb-choice" onClick={() => choose('demo')}>
                  <span className="onb-choice-ic">
                    <Icon.Sets width={20} height={20} />
                  </span>
                  <div>
                    <b>Move-in demo</b>
                    <em>A fully furnished 4-room flat to remix</em>
                  </div>
                  <Icon.ChevronRight width={18} height={18} />
                </button>
                <button type="button" className="onb-choice" onClick={() => choose('empty')}>
                  <span className="onb-choice-ic">
                    <Icon.FloorPlan width={20} height={20} />
                  </span>
                  <div>
                    <b>Start empty</b>
                    <em>A blank flat — furnish it from scratch</em>
                  </div>
                  <Icon.ChevronRight width={18} height={18} />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="onb-nav">
          <button type="button" className="btn" onClick={finish}>
            Skip
          </button>
          <div className="onb-dots">
            {[0, 1, 2].map((d) => (
              <button
                type="button"
                key={d}
                className={`onb-dot${d === step ? ' on' : ''}`}
                aria-label={`Step ${d + 1}`}
                onClick={() => setStep(d)}
              />
            ))}
          </div>
          {step < 2 ? (
            <button type="button" className="btn btn-accent" onClick={() => setStep(step + 1)}>
              {step === 0 ? 'Get started' : 'Next'}
              <Icon.ChevronRight width={14} height={14} />
            </button>
          ) : (
            <button type="button" className="btn btn-accent" onClick={() => choose('demo')}>
              Enter sandbox
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
