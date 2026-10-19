// The one placeholder: a quiet shimmering block where a figure will land (it holds still under reduced motion).
export function Bone({ w, h, round }: { w: number | string; h: number; round?: boolean }) {
  return <i className={`skl${round ? ' round' : ''}`} style={{ width: w, height: h }} />
}
