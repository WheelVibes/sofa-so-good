import { useRef } from 'react'
import { useFeature } from '../../features/useFeature'
import {
  type ModePref,
  THEME_META,
  THEME_NAMES,
  type ThemeName,
} from '../../state/slices/appearanceSlice'
import { useStore } from '../../state/store'
import { APP_VERSION } from '../../version'
import { openDocs } from '../docsUrl'
import { Modal } from '../Modal'
import { useIsMobile } from '../useIsMobile'
import { WalkSettings } from '../walk/WalkCameraControls'
import { Icon } from './icons'
import { Popover } from './Popover'
import { Tooltip } from './Tooltip'

const MODES: { key: ModePref; label: string; icon: 'Sun' | 'Moon' | 'Settings' }[] = [
  { key: 'light', label: 'Light', icon: 'Sun' },
  { key: 'dark', label: 'Dark', icon: 'Moon' },
  { key: 'auto', label: 'Auto', icon: 'Settings' },
]

/** The theme cards + light/dark/auto segmented control, shared between the
 *  desktop popover and the mobile centred modal. */
export function AppearanceControls() {
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const setCreditsOpen = useStore((s) => s.setCreditsOpen)
  const creditsOn = useFeature('assetCredits')
  const modePref = useStore((s) => s.modePref)
  const setModePref = useStore((s) => s.setModePref)
  const uiMode = useStore((s) => s.uiMode)
  const setUiMode = useStore((s) => s.setUiMode)
  const density = useStore((s) => s.density)
  const setDensity = useStore((s) => s.setDensity)
  const densityModeOn = useFeature('densityMode')
  const currentUser = useStore((s) => s.currentUser)
  const isMobile = useIsMobile()

  return (
    <>
      <div className="pop-label">Theme</div>
      <div className="appe-grid">
        {THEME_NAMES.map((t: ThemeName) => {
          const meta = THEME_META[t]
          return (
            <button
              key={t}
              type="button"
              className={`appe-card${theme === t ? ' on' : ''}`}
              onClick={() => setTheme(t)}
            >
              <span className="appe-sw">
                <i style={{ background: meta.chip }} />
                <i style={{ background: meta.accent }} />
              </span>
              <span className="appe-meta">
                <b>{meta.name}</b>
                <em>{meta.desc}</em>
              </span>
              <span className="appe-check">
                <Icon.Check width={16} height={16} />
              </span>
            </button>
          )
        })}
      </div>

      <div className="pop-label" style={{ marginTop: 10 }}>
        Appearance
      </div>
      <div className="seg accent appe-mode">
        {MODES.map((m) => {
          const Glyph = Icon[m.icon]
          return (
            <button
              key={m.key}
              type="button"
              className={modePref === m.key ? 'on' : ''}
              onClick={() => setModePref(m.key)}
            >
              <Glyph width={14} height={14} />
              {m.label}
            </button>
          )
        })}
      </div>

      <div className="pop-label" style={{ marginTop: 10 }}>
        Interface
      </div>
      <div className="seg accent appe-mode">
        <button
          type="button"
          className={uiMode === 'simple' ? 'on' : ''}
          onClick={() => setUiMode('simple')}
        >
          <Icon.Star width={14} height={14} />
          Simple
        </button>
        <button
          type="button"
          className={uiMode === 'pro' ? 'on' : ''}
          onClick={() => setUiMode('pro')}
        >
          <Icon.Settings width={14} height={14} />
          Pro
        </button>
      </div>
      <p
        style={{
          fontSize: 'var(--t-2xs)',
          color: 'var(--text-3)',
          margin: '6px 2px 0',
          lineHeight: 1.4,
        }}
      >
        {uiMode === 'simple'
          ? 'Essentials only — design tools, analysis & the floor-plan editor are hidden.'
          : 'Every feature, including analysis tools and the floor-plan editor.'}
      </p>

      {densityModeOn ? (
        <>
          <div className="pop-label" style={{ marginTop: 10 }}>
            Density
          </div>
          <div className="seg accent appe-mode">
            <button
              type="button"
              className={density === 'comfortable' ? 'on' : ''}
              onClick={() => setDensity('comfortable')}
            >
              Comfortable
            </button>
            <button
              type="button"
              className={density === 'compact' ? 'on' : ''}
              onClick={() => setDensity('compact')}
            >
              Compact
            </button>
          </div>
        </>
      ) : null}

      {/* Walk-mode camera settings (field of view + eye height) — self-gates to
          first-person mode, so it only appears here while walking. */}
      <WalkSettings />

      {/* Sign in / account + help links. Desktop only — the mobile main-menu sheet
          has its own footer for sign-in and a dedicated section for help items. */}
      {!isMobile ? (
        <>
          <button
            type="button"
            className="btn btn-soft btn-block"
            style={{ marginTop: 10 }}
            onClick={() => {
              const s = useStore.getState()
              s.setAppearanceOpen(false)
              s.setLoginOpen(true)
            }}
          >
            <Icon.Eye width={14} height={14} />
            {currentUser ? `Account · ${currentUser.name}` : 'Sign in'}
          </button>
          <div className="pop-label" style={{ marginTop: 10 }}>
            Help
          </div>
          <button type="button" className="btn btn-soft btn-block" onClick={openDocs}>
            <Icon.Book width={14} height={14} />
            User guide ↗
          </button>
          <button
            type="button"
            className="btn btn-soft btn-block"
            style={{ marginTop: 6 }}
            onClick={() => {
              const s = useStore.getState()
              s.setAppearanceOpen(false)
              s.startTour()
            }}
          >
            <Icon.Help width={14} height={14} />
            Replay guided tour
          </button>
        </>
      ) : null}

      {/* Asset credits / attribution (shown on desktop + mobile — outside the
          desktop-only Help block above). Universal licensing surface. */}
      {creditsOn ? (
        <button
          type="button"
          className="btn btn-soft btn-block"
          style={{ marginTop: 10 }}
          onClick={() => {
            const s = useStore.getState()
            s.setAppearanceOpen(false)
            setCreditsOpen(true)
          }}
        >
          <Icon.Credits width={14} height={14} />
          Asset credits
        </button>
      ) : null}

      {/* Running build (major.minor.patch.build) — what "Check for updates"
          compares against the deployed version. */}
      <div
        style={{
          marginTop: 10,
          fontSize: 'var(--t-2xs)',
          color: 'var(--text-3)',
          textAlign: 'center',
        }}
      >
        Sofa So Good · v{APP_VERSION}
      </div>
    </>
  )
}

/** Toolbar Appearance control: a palette button opening the theme cards + a
 *  light/dark/auto segmented control. On desktop it's an anchored popover; on
 *  mobile it's a centred, blurred-backdrop modal (the anchored popover would be
 *  clipped under the slim mobile bar). Mirrors the design's `.appearance`. */
export function AppearancePopover() {
  const ref = useRef<HTMLButtonElement>(null)
  const open = useStore((s) => s.appearanceOpen)
  const setOpen = useStore((s) => s.setAppearanceOpen)
  const isMobile = useIsMobile()

  return (
    <>
      <Tooltip label="Appearance" shortcut="">
        <button
          ref={ref}
          type="button"
          aria-label="Appearance"
          className={`tool-btn${open ? ' active' : ''}`}
          onClick={() => setOpen(!open)}
        >
          <Icon.Palette />
        </button>
      </Tooltip>
      {isMobile ? (
        <Modal open={open} onClose={() => setOpen(false)} title="Appearance" width={320}>
          <AppearanceControls />
        </Modal>
      ) : (
        <Popover open={open} anchorRef={ref} onClose={() => setOpen(false)} align="center">
          <div className="popover appearance" style={{ position: 'static', width: 268 }}>
            <AppearanceControls />
          </div>
        </Popover>
      )}
    </>
  )
}
