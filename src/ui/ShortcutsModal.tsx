import { SHORTCUT_GROUPS } from '../controls/shortcutHelp'
import { useStore } from '../state/store'
import { Modal } from './Modal'

/**
 * Keyboard-shortcuts reference overlay (opened with `?` or via ⌘K). Lists every
 * shortcut grouped by task, sourced from the pure `controls/shortcutHelp.ts`
 * (single keys stay in sync with `KEYBINDINGS`). Themed via the shared
 * `.kbd-grid` / `.kbd-row` / `<kbd>` vocabulary — no hardcoded colour.
 */
export function ShortcutsModal() {
  const open = useStore((s) => s.shortcutsHelpOpen)
  const setOpen = useStore((s) => s.setShortcutsHelpOpen)

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Keyboard shortcuts"
      sub="Speed up the design loop"
      width={620}
      panelId="shortcuts-help"
    >
      <div className="shortcuts-groups">
        {SHORTCUT_GROUPS.map((group) => (
          <section key={group.title} className="shortcuts-group">
            <h3 className="shortcuts-group-title">{group.title}</h3>
            <div className="kbd-grid">
              {group.rows.map((row) => (
                <div className="kbd-row" key={row.desc}>
                  <span>{row.desc}</span>
                  <span className="shortcuts-keys">
                    {row.keys.map((k) => (
                      <kbd key={k}>{k}</kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Modal>
  )
}
