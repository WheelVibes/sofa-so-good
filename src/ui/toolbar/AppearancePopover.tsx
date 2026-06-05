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
