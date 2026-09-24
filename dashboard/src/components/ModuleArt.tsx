// A small drawing per module, so the list can be read at a glance instead of
// word by word. Each one is a hand-written SVG (no images, no library, a few
// hundred bytes each) that animates gently when it is on screen; it holds
// still for anyone who asked for reduced motion.
export function ModuleArt({ id, large }: { id: string; large?: boolean }) {
  // Large fills the width it is given rather than sitting in the middle of
  // it: a dialog reads as one column, and a picture floating inside a wider
  // box reads as two.
  return (
    <svg
      className={large ? 'mart large' : 'mart'}
      width={large ? undefined : 104}
      height={large ? undefined : 58}
      viewBox="0 0 104 58"
      role="img"
      aria-label={`${id} preview`}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* In the list the tile is the picture. In a dialog the surrounding
          band is the tile, so the drawing can be centred in a box as wide as
          the words under it. */}
      {!large && <rect x="0.5" y="0.5" width="103" height="57" rx="9" fill="var(--sunken)" stroke="var(--grid)" />}
      {ART[id] ?? ART.core}
    </svg>
  )
}

const A = 'var(--accent)'
const M = 'var(--money)'
const T3 = 'var(--text-3)'

const ART: Record<string, React.ReactNode> = {
  // Bars with one marked as reached.
  goals: (
    <g>
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={16 + i * 17} y={40 - i * 6} width="9" height={8 + i * 6} rx="2.5" fill={i === 3 ? A : T3} opacity={i === 3 ? 1 : 0.35}>
          <animate attributeName="height" values={`0;${8 + i * 6}`} dur="0.6s" begin={`${i * 0.12}s`} fill="freeze" />
          <animate attributeName="y" values={`48;${40 - i * 6}`} dur="0.6s" begin={`${i * 0.12}s`} fill="freeze" />
        </rect>
      ))}
      <path d="M78 20l3.5 3.5L88 17" fill="none" stroke={A} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <animate attributeName="stroke-dasharray" values="0 20;20 0" dur="0.5s" begin="0.6s" fill="freeze" />
      </path>
    </g>
  ),
  // A link leaving the page.
  outbound: (
    <g>
      <rect x="16" y="16" width="34" height="26" rx="5" fill="none" stroke={T3} strokeWidth="2" opacity="0.5" />
      <path d="M46 29h34" stroke={A} strokeWidth="2.4" strokeLinecap="round" strokeDasharray="5 5">
        <animate attributeName="stroke-dashoffset" values="20;0" dur="1.6s" repeatCount="indefinite" />
      </path>
      <path d="M74 23l6 6-6 6" fill="none" stroke={A} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  ),
  // Traffic turning into money.
  revenue: (
    <g>
      <path d="M14 42c8 0 10-12 18-12s10 8 18 8 12-20 20-20 12 6 20 6" fill="none" stroke={A} strokeWidth="2.2" strokeLinecap="round" opacity="0.75" />
      <circle cx="90" cy="24" r="8" fill="none" stroke={M} strokeWidth="2.2" />
      <path d="M90 20v8M87.5 22.2h5M87.5 25.8h5" stroke={M} strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="30" cy="30" r="2.6" fill={M}>
        <animate attributeName="cx" values="30;90" dur="2.4s" repeatCount="indefinite" />
        <animate attributeName="cy" values="30;24" dur="2.4s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0;1;1;0" dur="2.4s" repeatCount="indefinite" />
      </circle>
    </g>
  ),
  // Steps narrowing, with the drop-off showing.
  funnels: (
    <g>
      {[0, 1, 2].map((i) => (
        <rect key={i} x={20 + i * 8} y={14 + i * 11} width={64 - i * 16} height="8" rx="3" fill={A} opacity={0.9 - i * 0.22}>
          <animate attributeName="width" values={`0;${64 - i * 16}`} dur="0.5s" begin={`${i * 0.15}s`} fill="freeze" />
        </rect>
      ))}
      <path d="M20 47h64" stroke={T3} strokeWidth="1.5" strokeDasharray="3 4" opacity="0.5" />
    </g>
  ),
  // Hours by weekday.
  rhythm: (
    <g>
      {Array.from({ length: 21 }).map((_, i) => {
        const x = 16 + (i % 7) * 11
        const y = 16 + Math.floor(i / 7) * 11
        const o = [0.15, 0.5, 0.9][(i * 5) % 3]
        return (
          <rect key={i} x={x} y={y} width="8" height="8" rx="2" fill={A} opacity={o}>
            <animate attributeName="opacity" values={`0;${o}`} dur="0.5s" begin={`${i * 0.03}s`} fill="freeze" />
          </rect>
        )
      })}
    </g>
  ),
  // One visitor's path.
  journeys: (
    <g>
      <path d="M18 40h68" stroke={T3} strokeWidth="1.6" opacity="0.4" />
      {[18, 40, 62, 86].map((x, i) => (
        <g key={x}>
          <circle cx={x} cy="40" r={i === 3 ? 5 : 3.5} fill={i === 3 ? M : A} opacity={i === 3 ? 1 : 0.8}>
            <animate attributeName="r" values={`0;${i === 3 ? 5 : 3.5}`} dur="0.4s" begin={`${i * 0.18}s`} fill="freeze" />
          </circle>
          <rect x={x - 6} y={i % 2 ? 18 : 26} width="12" height="7" rx="2" fill={A} opacity="0.2" />
        </g>
      ))}
    </g>
  ),
  // Visitors on a map.
  map: (
    <g opacity="0.9">
      <path
        d="M20 22c5-3 9 1 14-1s7-5 12-3 5 7 11 7 9-5 15-3"
        fill="none"
        stroke={T3}
        strokeWidth="2"
        opacity="0.45"
      />
      <path d="M18 36c7 2 11-3 18-2s10 6 17 5 11-6 19-4" fill="none" stroke={T3} strokeWidth="2" opacity="0.45" />
      {[[32, 24], [56, 33], [74, 21], [45, 40]].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="3" fill={A}>
          <animate attributeName="opacity" values="0.3;1;0.3" dur="2.4s" begin={`${i * 0.4}s`} repeatCount="indefinite" />
        </circle>
      ))}
    </g>
  ),
  // A question and an answer.
  ask: (
    <g>
      <rect x="16" y="14" width="44" height="16" rx="8" fill={T3} opacity="0.25" />
      <rect x="44" y="34" width="44" height="16" rx="8" fill={A} opacity="0.85">
        <animate attributeName="opacity" values="0;0.85" dur="0.5s" begin="0.4s" fill="freeze" />
      </rect>
      {[24, 32, 40].map((x, i) => (
        <circle key={x} cx={x} cy="22" r="2" fill={T3}>
          <animate attributeName="opacity" values="0.3;1;0.3" dur="1.2s" begin={`${i * 0.2}s`} repeatCount="indefinite" />
        </circle>
      ))}
      <path d="M54 42h24" stroke="var(--bg)" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
    </g>
  ),
  // Cohorts: each week's squares fade as fewer people come back.
  retention: (
    <g>
      {Array.from({ length: 16 }).map((_, i) => {
        const col = i % 4
        const row = Math.floor(i / 4)
        const o = Math.max(0.12, 0.95 - col * 0.24 - row * 0.06)
        return (
          <rect key={i} x={20 + col * 17} y={12 + row * 9.5} width="14" height="7" rx="2" fill={A} opacity={o}>
            <animate attributeName="opacity" values={`0;${o}`} dur="0.5s" begin={`${i * 0.035}s`} fill="freeze" />
          </rect>
        )
      })}
    </g>
  ),
  // Speed: a dial with the needle in the good half.
  vitals: (
    <g>
      <path d="M28 42a24 24 0 0 1 48 0" fill="none" stroke={T3} strokeWidth="5" strokeLinecap="round" opacity="0.35" />
      <path d="M28 42a24 24 0 0 1 48 0" fill="none" stroke={A} strokeWidth="5" strokeLinecap="round" strokeDasharray="75" strokeDashoffset="75">
        <animate attributeName="stroke-dashoffset" values="75;26" dur="0.9s" fill="freeze" />
      </path>
      <g>
        <path d="M52 42 38 31" stroke={A} strokeWidth="2.6" strokeLinecap="round">
          <animateTransform attributeName="transform" type="rotate" values="-38 52 42;12 52 42;0 52 42" dur="1.1s" fill="freeze" />
        </path>
      </g>
      <circle cx="52" cy="42" r="3.2" fill={A} />
    </g>
  ),
  // Consent: a page with a small bar at the bottom and two buttons.
  consent: (
    <g>
      <rect x="14" y="10" width="76" height="38" rx="5" fill="none" stroke={T3} strokeWidth="1.8" opacity="0.4" />
      <path d="M21 18h32M21 24h44M21 30h26" stroke={T3} strokeWidth="2" strokeLinecap="round" opacity="0.32" />
      <g>
        <rect x="42" y="34" width="44" height="12" rx="4" fill={A} opacity="0.16" stroke={A} strokeWidth="1.2" />
        <rect x="46" y="37.5" width="14" height="5" rx="2.5" fill="none" stroke={A} strokeWidth="1.2" />
        <rect x="64" y="37.5" width="18" height="5" rx="2.5" fill={A} />
        <animateTransform attributeName="transform" type="translate" values="0 14;0 0" dur="0.6s" begin="0.25s" fill="freeze" />
        <animate attributeName="opacity" values="0;1" dur="0.4s" begin="0.25s" fill="freeze" />
      </g>
    </g>
  ),
  // A robot reading a page it never renders.
  crawlers: (
    <g>
      <rect x="16" y="14" width="30" height="30" rx="4" fill="none" stroke={T3} strokeWidth="1.8" opacity="0.45" />
      <path d="M22 21h18M22 27h18M22 33h11" stroke={T3} strokeWidth="2" strokeLinecap="round" opacity="0.35" />
      <path d="M48 29h12" stroke={A} strokeWidth="2" strokeLinecap="round" strokeDasharray="4 4">
        <animate attributeName="stroke-dashoffset" values="16;0" dur="1.4s" repeatCount="indefinite" />
      </path>
      <g>
        <path d="M74 14v5" stroke={A} strokeWidth="2" strokeLinecap="round" />
        <circle cx="74" cy="12" r="2" fill={A} />
        <rect x="62" y="19" width="24" height="20" rx="6" fill="none" stroke={A} strokeWidth="2" />
        <circle cx="69" cy="28" r="2.2" fill={A}>
          <animate attributeName="r" values="2.2;0.5;2.2" dur="3s" repeatCount="indefinite" />
        </circle>
        <circle cx="79" cy="28" r="2.2" fill={A}>
          <animate attributeName="r" values="2.2;0.5;2.2" dur="3s" repeatCount="indefinite" />
        </circle>
      </g>
    </g>
  ),
  // A small form, sent: the button becomes a tick.
  forms: (
    <g>
      <rect x="22" y="10" width="60" height="9" rx="3" fill="none" stroke={T3} strokeWidth="1.6" opacity="0.5" />
      <rect x="22" y="23" width="60" height="9" rx="3" fill="none" stroke={T3} strokeWidth="1.6" opacity="0.5" />
      <rect x="22" y="37" width="26" height="11" rx="5.5" fill={A}>
        <animate attributeName="width" values="26;11;11" keyTimes="0;0.4;1" dur="1.8s" fill="freeze" />
      </rect>
      <path d="M25 42.5l2.4 2.4 4.2-4.6" fill="none" stroke="var(--accent-ink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0">
        <animate attributeName="opacity" values="0;0;1" keyTimes="0;0.45;1" dur="1.8s" fill="freeze" />
      </path>
    </g>
  ),
  // A search field, and the result someone clicked.
  search: (
    <g>
      <rect x="16" y="10" width="72" height="12" rx="6" fill="none" stroke={T3} strokeWidth="1.6" opacity="0.5" />
      <circle cx="24" cy="16" r="3" fill="none" stroke={A} strokeWidth="1.6" />
      <path d="M26.2 18.2l2.3 2.3" stroke={A} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M33 16h26" stroke={T3} strokeWidth="2" strokeLinecap="round" opacity="0.45" />
      {[0, 1, 2].map((i) => (
        <path key={i} d={`M16 ${30 + i * 8}h${i === 1 ? 50 : 40 - i * 6}`} stroke={i === 1 ? A : T3} strokeWidth="3" strokeLinecap="round" opacity={i === 1 ? 1 : 0.35}>
          {i === 1 && <animate attributeName="opacity" values="0.35;1;1" keyTimes="0;0.3;1" dur="2.4s" fill="freeze" />}
        </path>
      ))}
      <path d="M70 36l7 3-3 1-1 3z" fill={A}>
        <animateTransform attributeName="transform" type="translate" values="10 8;0 0" dur="0.9s" fill="freeze" />
      </path>
    </g>
  ),
  core: (
    <g>
      <path d="M16 42c10 0 14-16 24-16s14 10 24 10 14-18 24-18" fill="none" stroke={A} strokeWidth="2.2" strokeLinecap="round" />
    </g>
  ),
}
