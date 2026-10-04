// "Mostly from Facebook", with the source's own icon (from this server's cache,
// never from the site) or its first letter.
import { RefMark } from '../cards/refIcons'
import { useHostIcon } from '../moments/SourceChip'
import { sourceHost, sourceLine, type Surge } from './surge'

export function SourceLine({ surge }: { surge: Surge }) {
  const host = sourceHost(surge)
  const icon = useHostIcon(host)
  return (
    <p className="sg-source">
      {host && <RefMark host={host} icon={icon} />}
      <span>{sourceLine(surge)}</span>
    </p>
  )
}
