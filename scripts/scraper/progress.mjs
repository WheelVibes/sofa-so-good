/** Parse one NDJSON line into an event object, or null if it isn't JSON
 *  (the scraper also prints human log lines we ignore). */
export function parseEvent(line) {
  const s = line.trim();
  if (!s || s[0] !== '{') return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** Stateful splitter: feed it arbitrary string chunks; it calls `onLine` for
 *  each complete '\n'-terminated line. Call `.end()` to flush a trailing
 *  partial line. */
export function createLineSplitter(onLine) {
  let buf = '';
  function feed(chunk) {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf('\n')) !== -1) {
      onLine(buf.slice(0, idx));
      buf = buf.slice(idx + 1);
    }
  }
  feed.end = () => {
    if (buf.length) {
      onLine(buf);
      buf = '';
    }
  };
  return feed;
}
