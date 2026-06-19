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
    <div className="mt-1 text-[10px] text-[var(--text-3)]">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-[var(--text-2)]"
        >
          {text}
        </a>
      ) : (
        <span>{text}</span>
      )}
    </div>
  )
}
