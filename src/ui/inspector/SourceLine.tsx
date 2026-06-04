interface SourceLineProps {
  attribution?: string
  license?: 'CC0' | 'IKEA'
  sourceUrl?: string
}

export function SourceLine({ attribution, license, sourceUrl }: SourceLineProps) {
  if (!attribution && !license) return null
  const text = `Source: ${attribution ?? 'Unknown'}${license ? ` · ${license}` : ''}`
  return (
    <div className="mt-1 text-[10px] text-[var(--text-3)]">
      {sourceUrl ? (
        <a
          href={sourceUrl}
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
