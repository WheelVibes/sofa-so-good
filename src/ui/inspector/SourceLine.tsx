import { safeUrl } from '../../utils/safeUrl'

interface SourceLineProps {
  attribution?: string
  license?: 'CC0' | 'CC-BY' | 'IKEA'
  sourceUrl?: string
}

export function SourceLine({ attribution, license, sourceUrl }: SourceLineProps) {
  if (!attribution && !license) return null
  const text = `Source: ${attribution ?? 'Unknown'}${license ? ` · ${license}` : ''}`
  // Sanitize: imported defs can carry a javascript:/data: sourceUrl (XSS).
  const href = safeUrl(sourceUrl)
  return (
    <div className="panel-sub plain" style={{ marginTop: 'var(--s-1)' }}>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'inherit', textDecoration: 'underline' }}
        >
          {text}
        </a>
      ) : (
        <span>{text}</span>
      )}
    </div>
  )
}
