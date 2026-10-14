// The uptime probe's last few looks at the site's homepage, for the panel's
// list of what was checked. Nothing yet (or a failed read) is an empty list.
import { useEffect, useState } from 'react'
import { more, type ProbeLook } from '../../lib/apiMore'

export function useProbes(site: string): ProbeLook[] {
  const [list, setList] = useState<ProbeLook[]>([])
  useEffect(() => {
    let current = true
    more
      .probes(site)
      .then((r) => current && setList(r.probes))
      .catch(() => undefined)
    return () => {
      current = false
    }
  }, [site])
  return list
}
