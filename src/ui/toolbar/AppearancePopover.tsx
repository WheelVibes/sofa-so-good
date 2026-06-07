import { useRef } from 'react'
import {
  type ModePref,
  THEME_META,
  THEME_NAMES,
  type ThemeName,
} from '../../state/slices/appearanceSlice'
import { useStore } from '../../state/store'
import { Modal } from '../Modal'
import { useIsMobile } from '../useIsMobile'
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
  const modePref = useStore((s) => s.modePref)
  const setModePref = useStore((s) => s.setModePref)
  const uiMode = useStore((s) => s.uiMode)
  const setUiMode = useStore((s) => s.setUiMode)

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
