// The mock's random helpers, as they are there (a seeded generator, so a fixture is the same on every load).
export const norm = (a: number[]): number[] => {
  const t = a.reduce((p, q) => p + q, 0) || 1
  return a.map((x) => x / t)
}

export function mulberry(seed: number): () => number {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export const gauss = (r: () => number): number => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r())

export function poisson(r: () => number, l: number): number {
  if (l <= 0) return 0
  if (l > 30) return Math.max(0, Math.round(l + Math.sqrt(l) * gauss(r)))
  const L = Math.exp(-l)
  let k = 0
  let p = 1
  do {
    k++
    p *= r()
  } while (p > L)
  return k - 1
}

export const pick = (r: () => number, w: number[]): number => {
  let x = r()
  let i = 0
  for (; i < w.length - 1; i++) {
    x -= w[i]
    if (x < 0) break
  }
  return i
}
