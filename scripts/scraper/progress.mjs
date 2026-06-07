/** Parse one NDJSON line into an event object, or null if it isn't JSON
 *  (the scraper also prints human log lines we ignore). */
export function parseEvent(line) {
  const s = line.trim()
  if (s?.[0] !== '{') return null
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

/** Stateful splitter: feed it arbitrary string chunks; it calls `onLine` for
 *  each complete '\n'-terminated line. Call `.end()` to flush a trailing
 *  partial line. */
export function createLineSplitter(onLine) {
  let buf = ''
  function feed(chunk) {
    buf += chunk
    let idx = buf.indexOf('\n')
    while (idx !== -1) {
      onLine(buf.slice(0, idx))
      buf = buf.slice(idx + 1)
      idx = buf.indexOf('\n')
    }
  }
  feed.end = () => {
    if (buf.length) {
      onLine(buf)
      buf = ''
    }
  }
  return feed
}
