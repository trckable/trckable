// What a test has just made, or nothing: a missing value fails the test with its own words
// instead of a non-null assertion that would hide it.
export function need<T>(value: T | null | undefined, what = 'a value'): T {
  if (value === null || value === undefined) throw new Error(`expected ${what}`)
  return value
}
