// The hours of today still to come, hatched so they read as not yet, not as missing data.
export function FutureHatch({ x, y, width, height }: { x: number; y: number; width: number; height: number }) {
  return (
    <>
      <defs>
        <pattern id="mk-future" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="7" stroke="var(--mk-axis)" strokeOpacity="0.22" strokeWidth="1.5" />
        </pattern>
      </defs>
      <rect x={x} y={y} width={width} height={height} fill="url(#mk-future)" />
    </>
  )
}
