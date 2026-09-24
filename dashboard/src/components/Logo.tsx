export function Wordmark({ height = 28 }: { height?: number }) {
  return (
    <svg height={height} viewBox="0 0 334 80" role="img" aria-label="trckable" style={{ display: 'block' }}>
      {/* The ghost peeks over its chart line; its eyes blink now and then, and again on hover. */}
      <g transform="translate(0 2) scale(1.18)">
        <path fill="var(--accent)" d="M12 30a20 20 0 0 1 40 0v22l-5-3.5-5 3.5-5-3.5-5 3.5-5-3.5-5 3.5-5-3.5-5 3.5z" />
        <g className="eyes">
          <circle className="eye" cx="25.5" cy="29" r="3.6" fill="var(--bg)" />
          <circle className="eye" cx="38.5" cy="29" r="3.6" fill="var(--bg)" />
        </g>
        <path fill="none" stroke="var(--bg)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" d="M5 47l12-6 9 4 12-9 9 3 12-12" />
        <path fill="none" stroke="var(--text)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" d="M5 47l12-6 9 4 12-9 9 3 12-12" />
      </g>
      <text x="86" y="58" fill="var(--text)" textLength="248" lengthAdjust="spacingAndGlyphs" fontFamily="var(--font)" fontSize="60" fontWeight="600">
        trckable
      </text>
    </svg>
  )
}

/** The ghost peeking over a chart line; used for loading and empty states. */
export function Ghost({ size = 64, peek = false }: { size?: number; peek?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className={peek ? 'peek' : undefined}>
      <path fill="var(--accent)" d="M12 30a20 20 0 0 1 40 0v22l-5-3.5-5 3.5-5-3.5-5 3.5-5-3.5-5 3.5-5-3.5-5 3.5z" />
      <circle cx="25.5" cy="29" r="3.6" fill="var(--bg)" />
      <circle cx="38.5" cy="29" r="3.6" fill="var(--bg)" />
      <path fill="none" stroke="var(--bg)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" d="M5 47l12-6 9 4 12-9 9 3 12-12" />
      <path fill="none" stroke="var(--text)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" d="M5 47l12-6 9 4 12-9 9 3 12-12" />
    </svg>
  )
}
