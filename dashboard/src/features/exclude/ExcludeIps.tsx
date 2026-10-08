// Settings → Data & privacy: the owner's own addresses and ranges, left out
// before anything is counted. The list is the only thing kept.
import { useId, useState } from 'react'
import { Row } from '../../components/Row'
import { FieldError, fieldProps } from '../../kit/FieldError'
import type { SiteConfig } from '../../lib/apiMore'
import { copy } from './copy'
import { parseList } from './ipList'

export function ExcludeIps({ c, save }: { c: SiteConfig; save: (patch: Partial<SiteConfig>, said?: string) => void }) {
  const [text, setText] = useState((c.exclude_ips ?? []).join('\n'))
  const [wrong, setWrong] = useState<string | null>(null)
  const errId = useId()
  const keep = () => {
    const r = parseList(text)
    let said: string | null = null
    if (r.bad) said = copy.ips.bad(r.bad)
    else if (r.many) said = copy.ips.many
    setWrong(said)
    if (said) return
    if (r.list.join('\n') === (c.exclude_ips ?? []).join('\n')) return
    save({ exclude_ips: r.list }, r.list.length ? copy.ips.saved(r.list.length) : copy.ips.cleared)
  }
  return (
    <Row label={copy.ips.label} hint={copy.ips.hint}>
      <div>
      <textarea
        className="input"
        style={{ minHeight: 76, width: 260, padding: '8px 10px', fontFamily: 'var(--mono)', fontSize: 12.5 }}
        value={text}
        spellCheck={false}
        aria-label={copy.ips.label}
        {...fieldProps(errId, wrong)}
        placeholder={copy.ips.placeholder}
        onChange={(e) => {
          setText(e.target.value)
          setWrong(null)
        }}
        onBlur={keep}
      />
      <FieldError id={errId} error={wrong} />
      </div>
    </Row>
  )
}
