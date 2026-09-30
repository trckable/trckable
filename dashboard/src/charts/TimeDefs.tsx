// The main chart's paint: its clip (the data is drawn inside the plot and
// nowhere else), Replay's dimming mask, and the gradients. The svg itself
// stays overflow: visible so an edge label or the hover dot is not cut in
// half; a line or a column can never paint over the cards above it, whatever
// a transition does.
export function TimeDefs({ id, w, h, base, padL, padT, tone }: { id: string; w: number; h: number; base: number; padL: number; padT: number; tone: string }) {
  return (
    <defs>
      <clipPath id={id + '-plot'}>
        <rect x={padL} y={0} width={Math.max(0, w - padL)} height={h} />
      </clipPath>
      {/* The main plot ends at its axis: a line at zero rests on it, and its
          stroke never dips under it. */}
      <clipPath id={id + '-main'}>
        <rect x={padL} y={0} width={Math.max(0, w - padL)} height={base} />
      </clipPath>
      {/* Lit left of the cut, hidden right of it (a grey copy shows through).
          Only the rect moves (a CSS transform), so the paths are never
          redrawn; it is invisible while merely hovering. */}
      <mask id={id + '-dim'} maskUnits="userSpaceOnUse" x={0} y={-padT} width={w + 16} height={h + padT}>
        <rect x={0} y={-padT} width={w + 16} height={h + padT} fill="#fff" />
        <rect className="chart-dim" x={0} y={-padT} width={w + 16} height={h + padT} fill="#000" />
      </mask>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={tone} stopOpacity="0.26" />
        <stop offset="1" stopColor={tone} stopOpacity="0" />
      </linearGradient>
      {/* Revenue columns, lit from the top like the line above them; today's is striped. */}
      <linearGradient id={id + '-money'} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="var(--money)" stopOpacity="1" />
        <stop offset="1" stopColor="var(--money)" stopOpacity="0.45" />
      </linearGradient>
      <pattern id={id + '-stripe'} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" fill="var(--money)" fillOpacity="0.28" />
        <rect width="3" height="6" fill="var(--money)" fillOpacity="0.9" />
      </pattern>
    </defs>
  )
}
