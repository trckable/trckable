// A rate drawn per bucket has no value where nothing happened (no sessions that
// day). Rather than dropping to zero, the line keeps the last value it had;
// leading gaps take the first value that exists.
export function carryOver(values: number[], has: boolean[]): number[] {
  const first = has.findIndex(Boolean)
  if (first < 0) return values.map(() => 0)
  let last = values[first]
  return values.map((v, i) => {
    if (has[i]) last = v
    return last
  })
}
