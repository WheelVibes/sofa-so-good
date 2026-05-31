import { KEYBINDINGS, type KeybindingId } from '../../controls/keybindings'

/** Bindings that are triggered with Ctrl/Cmd held. */
const MOD_BINDINGS: ReadonlySet<KeybindingId> = new Set([
  'undo',
  'redo',
  'copySelected',
  'pasteClipboard',
  'duplicateSelected',
])

/** Human display string for a keybinding (e.g. 'M', 'Ctrl Z'). Empty when the
 *  id has no binding. Sourced from KEYBINDINGS so the toolbar never hardcodes
 *  shortcut text. */
export function shortcutLabel(id: KeybindingId): string {
  const code = KEYBINDINGS[id]
  if (!code) return ''
  const key = code.startsWith('Key') ? code.slice(3) : code
  return MOD_BINDINGS.has(id) ? `Ctrl ${key}` : key
}
