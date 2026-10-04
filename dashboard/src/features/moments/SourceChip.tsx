// The small chip beside a card's figure: where it came from. A referring site
// carries its own icon, from this server's cache (the browser never asks the
// site: features/cards/refIcons), or its first letter; a channel its colour; a
// page its path.
import { useEffect, useState } from 'react'
import { call } from '../../lib/api'
import { channelColor, channelLabel } from '../../lib/palette'
import { RefMark } from '../cards/refIcons'

export type Chip = { host: string } | { channel: string } | { path: string }

function useHostIcon(host: string | null): boolean {
  const [got, setGot] = useState<{ host: string; has: boolean } | null>(null)
  useEffect(() => {
    if (!host) return
    let live = true
    call<{ icons: string[] }>('GET', '/referrer-icons?host=' + encodeURIComponent(host), undefined, undefined, true)
      .then((r) => live && setGot({ host, has: r.icons.length > 0 }))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [host])
  return !!host && got?.host === host && got.has
}

export function SourceChip({ chip }: { chip: Chip }) {
  const host = 'host' in chip ? chip.host : null
  const icon = useHostIcon(host)
  if ('host' in chip)
    return (
      <span className="side-chip" title={chip.host}>
        <RefMark host={chip.host} icon={icon} />
        {chip.host}
      </span>
    )
  if ('channel' in chip)
    return (
      <span className="side-chip">
        <i className="side-dot" style={{ background: channelColor(chip.channel) }} aria-hidden="true" />
        {channelLabel(chip.channel)}
      </span>
    )
  return <span className="side-chip side-path">{chip.path}</span>
}
