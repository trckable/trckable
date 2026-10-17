// What Explore keeps for next time: whether it was full width, and whether its list of sections was folded.
const kept = (key: string): boolean => {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}
const keep = (key: string, on: boolean) => {
  try {
    localStorage.setItem(key, on ? '1' : '0')
  } catch {
    /* a blocked store only forgets */
  }
}

export const wasFull = () => kept('trckable:xfull')
export const keepFull = (on: boolean) => keep('trckable:xfull', on)
export const wasFolded = () => kept('trckable:xrail')
export const keepFolded = (on: boolean) => keep('trckable:xrail', on)
