// Settings → Data & privacy: the owner's own addresses and ranges, left out
// before anything is counted. The list is the only thing kept.
import { useEffect, useId, useRef, useState } from 'react'
import { Row } from '../../components/Row'
import { FieldError, fieldProps } from '../../kit/FieldError'
import { more, type SiteConfig } from '../../lib/apiMore'
import { settingsParam } from '../../lib/settings'
import { toast } from '../../components/toastBus'
import { copy } from './copy'
import { parseList, validEntry } from './ipList'

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
  // The setup ring's "Add my IP" opens Settings here.
  const here = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (settingsParam('focus') === 'exclude-ips') here.current?.scrollIntoView({ block: 'center' })
  }, [])
  const addMine = async () => {
    try {
      const ip = (await more.me()).ip
      if (!ip || !validEntry(ip)) throw new Error('no address')
      const list = parseList(text).list
      if (list.includes(ip)) return void toast(copy.ips.have)
      const next = [...list, ip]
      setText(next.join('\n'))
      setWrong(null)
      save({ exclude_ips: next }, copy.ips.added)
    } catch {
      toast(copy.ips.fail, 'error')
    }
  }
  return (
    <Row label={copy.ips.label} hint={copy.ips.hint}>
      <div ref={here}>
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
      <button type="button" className="btn" onClick={() => void addMine()}>
        {copy.ips.add}
      </button>
      </div>
    </Row>
  )
}
