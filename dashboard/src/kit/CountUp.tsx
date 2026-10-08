// A figure arriving: counts up from 0 once (tabular figures, so the width
// does not jump), then rolls like any live number.
import { useCountUp } from '../lib/motion'
import { RollingNumber } from './RollingNumber'

export function CountUp({ value, format, whole = true }: { value: number; format: (n: number) => string; whole?: boolean }) {
  const { v, intro } = useCountUp(value, 120)
  if (!intro) return <RollingNumber value={value} format={format} />
  return <span className="num">{format(whole ? Math.round(v) : v)}</span>
}
