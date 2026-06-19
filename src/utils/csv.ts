/**
 * Shared CSV field helpers — RFC-4180 quoting + OWASP CSV-injection defense.
 *
 * CSV exports are opened in Excel / Google Sheets, which treat a cell whose first
 * character is `= + - @` (or a TAB / CR control char) as a *formula*. Attacker-
 * controllable text (item / material / room names, quote-template branding, …)
 * starting with those characters would otherwise execute as a live formula on the
 * victim's machine (e.g. `=HYPERLINK(...)`, `=cmd|...`) — data exfiltration / RCE.
 *
 * `csvSafeField` neutralises that for TEXT fields by prefixing a single quote `'`,
 * which spreadsheets render as plain text, and then applies RFC-4180 quoting.
 * Genuinely numeric columns are emitted with `csvNumberField`, which never adds the
 * prefix (so legitimate negative numbers stay numeric).
 */

/** Characters that make a spreadsheet treat a cell as a formula / command. */
const FORMULA_LEAD = new Set(['=', '+', '-', '@', '\t', '\r'])

/**
 * RFC-4180 quoting: wrap in double quotes and double any interior quote when the
 * value contains a comma, double-quote, CR or LF. Plain values are returned as-is.
 */
function rfc4180(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * Sanitise a TEXT CSV field: neutralise a leading formula character (OWASP CSV
 * injection defense) then apply RFC-4180 quoting. Use for every field that can
 * contain user / untrusted input (names, notes, branding, room labels, …).
 *
 * The formula guard inspects the first character *after* a leading double-quote
 * (`"=cmd"` is just as dangerous once a spreadsheet strips the quotes) and adds a
 * single `'` prefix so the cell is treated as text. Normal values are unchanged.
 */
export function csvSafeField(value: string | number): string {
  const s = String(value)
  if (s.length === 0) return s
  // A leading double-quote can be used to smuggle a formula past a naive guard.
  const lead = s[0] === '"' && s.length > 1 ? s[1] : s[0]
  const guarded = FORMULA_LEAD.has(lead) ? `'${s}` : s
  return rfc4180(guarded)
}

/**
 * Emit a genuinely numeric cell. Numbers cannot carry a formula-injection payload,
 * so no `'` prefix is added (a legitimate negative number stays numeric). Non-finite
 * values fall back to an empty cell.
 */
export function csvNumberField(value: number): string {
  return Number.isFinite(value) ? String(value) : ''
}
