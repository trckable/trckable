// Step one of adding a site: the domain, cleaned as it is typed. What will be
// counted shows under the field as soon as it is a domain, and a problem shows
// once the field is left or Enter is pressed (never while still typing).
import { AlertCircle, Check, Info } from 'lucide-react'
import { useState } from 'react'
import { SiteMark } from '../../components/SiteMark'
import { wizard as t } from './copy'
import { type DomainCheck } from './domain'

export type Verdict = DomainCheck | 'added'

function Status({ verdict, clean, shown }: { verdict: Verdict; clean: string; shown: boolean }) {
  if (verdict === 'ok')
    return (
      <span className="wiz-status ok" id="wiz-status">
        <Check size={14} strokeWidth={2.25} aria-hidden="true" />
        <span className="wiz-chip">
          {t.countPre} <b>{clean}</b> {t.countPost}
        </span>
      </span>
    )
  if (verdict === 'added' && shown)
    return (
      <span className="wiz-status warn" id="wiz-status" role="status">
        <Info size={14} strokeWidth={2} aria-hidden="true" />
        {t.added}
      </span>
    )
  if ((verdict === 'space' || verdict === 'invalid') && shown)
    return (
      <span className="wiz-status bad" id="wiz-status" role="alert">
        <AlertCircle size={14} strokeWidth={2} aria-hidden="true" />
        {verdict === 'space' ? t.space : t.invalid}
      </span>
    )
  return (
    <span className="wiz-status faint" id="wiz-status">
      {t.domainHelp}
    </span>
  )
}

export function DomainStep(p: { domain: string; setDomain: (d: string) => void; clean: string; verdict: Verdict; locked: boolean; onSubmit: () => void }) {
  const [left, setLeft] = useState(false)
  const [tried, setTried] = useState(false)
  const shown = left || tried
  return (
    <form
      id="wiz-domain"
      className="wiz-domain"
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (p.verdict === 'ok' || p.locked) p.onSubmit()
      }}
    >
      <label className={'wiz-field' + (shown && p.verdict !== 'ok' && p.verdict !== 'empty' && !p.locked ? ' bad' : '')}>
        {!p.domain.includes('//') && (
          <span className="wiz-prefix" aria-hidden="true">
            {t.prefix}
          </span>
        )}
        <input
          value={p.domain}
          onChange={(e) => p.setDomain(e.target.value)}
          onBlur={() => setLeft(p.domain.trim() !== '')}
          onKeyDown={(e) => e.key === 'Enter' && setTried(true)} // a disabled Continue swallows Enter: say why
          placeholder={t.placeholder}
          aria-label={t.domain}
          aria-describedby="wiz-status"
          aria-invalid={shown && p.verdict !== 'ok' && p.verdict !== 'empty'}
          readOnly={p.locked}
          autoFocus
          required
          spellCheck={false}
          autoCapitalize="none"
          autoComplete="url"
          inputMode="url"
        />
        <SiteMark site={{ domain: p.clean || p.domain || '?' }} size={28} />
      </label>
      {!p.locked && <Status verdict={p.verdict} clean={p.clean} shown={shown} />}
    </form>
  )
}
