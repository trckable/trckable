// Settings → Data & privacy: the owner's own addresses and ranges, left out
// before anything is counted. The list is the only thing kept.
import { useState } from 'react'
import { Row } from '../../components/Row'
import { toast } from '../../components/Toast'
import type { SiteConfig } from '../../lib/apiMore'
import { copy } from './copy'
import { parseList } from './ipList'

export function ExcludeIps({ c, save }: { c: SiteConfig; save: (patch: Partial<SiteConfig>, said?: string) => void }) {
  const [text, setText] = useState((c.exclude_ips ?? []).join('\n'))
  const [wrong, setWrong] = useState(false)
  const keep = () => {
    const r = parseList(text)
    setWrong(!!r.bad || !!r.many)
    if (r.bad) return toast(copy.ips.bad(r.bad), 'error')
    if (r.many) return toast(copy.ips.many, 'error')
    if (r.list.join('\n') === (c.exclude_ips ?? []).join('\n')) return
    save({ exclude_ips: r.list }, r.list.length ? copy.ips.saved(r.list.length) : copy.ips.cleared)
  }
  return (
    <Row label={copy.ips.label} hint={copy.ips.hint}>
      <textarea
        className="input"
        style={{ minHeight: 76, width: 260, padding: '8px 10px', fontFamily: 'var(--mono)', fontSize: 12.5 }}
        value={text}
        spellCheck={false}
        aria-label={copy.ips.label}
        aria-invalid={wrong}
        placeholder={copy.ips.placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={keep}
      />
    </Row>
  )
}
