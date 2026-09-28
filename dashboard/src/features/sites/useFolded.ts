// Which group headers are folded: this person's own choice on this device,
// not the account's, so it lives in the browser (and a browser that keeps
// nothing simply shows every group open).
import { useState } from 'react'

const KEY = 'trckable:sites-folded'

function read(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

export function useFolded(): [Set<string>, (key: string) => void] {
  const [folded, setFolded] = useState(read)
  const fold = (key: string) => {
    const next = new Set(folded)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setFolded(next)
    try {
      localStorage.setItem(KEY, JSON.stringify([...next]))
    } catch {
      // Private mode: folded for this visit only.
    }
  }
  return [folded, fold]
}
