// The install flow, one component wherever a site still needs its script: the
// add-site wizard's Install step, the card on a new site's dashboard, and
// Settings → Install. Pick a method, copy the code (or the AI prompt), say
// "I've installed it", and watch the check and then the first visit arrive.
// Loaded on demand: only new sites and the wizard ever show it.
import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import type { Site, Visit } from '../../lib/api'
import type { Ctx } from '../../lib/install'
import { AiCard } from './AiCard'
import { CheckPanel } from './CheckPanel'
import { CookielessSwitch } from './CookielessSwitch'
import { copy } from './copy'
import { MethodPanel } from './MethodPanel'
import { MethodTabs } from './MethodTabs'
import { methodOf } from './snippet'
import { useCookieless } from './useCookieless'
import { useInstallCheck } from './useInstallCheck'
import { WaitingCard } from './WaitingCard'
import './install.css'

export type Variant = 'card' | 'wizard' | 'settings'

/** ?method=wordpress opens on that platform: the docs link straight to it. */
function firstMethod(): string {
  const wanted = new URLSearchParams(location.search).get('method')
  return wanted ? methodOf(wanted).id : 'script'
}

function Head({ site, variant }: { site: Site; variant: Variant }) {
  if (variant !== 'settings') return null
  return <h2 className="inst-title-small">{copy.titleSettings(site.domain)}</h2>
}

export function Install({ site, visits, variant = 'card', setup }: { site: Site; visits: Visit[]; variant?: Variant; setup?: boolean }) {
  const [pick, setPick] = useState(firstMethod)
  const [started, setStarted] = useState(false)
  const cookieless = useCookieless(site.id)
  const first = visits[0]
  const check = useInstallCheck(site.id, !!first)
  // The proxy key is a credential, so the server sends it to owners only.
  // A viewer still sees the recipe, with the key named rather than spelled out.
  const ctx: Ctx = { host: location.origin, site: site.id, domain: site.domain, proxyKey: site.proxy_key || 'your-proxy-key', cookieless: cookieless.on === true }
  const method = methodOf(pick)
  if (variant === 'card') return <WaitingCard site={site} visits={visits} ctx={ctx} pick={pick} onPick={setPick} setup={setup} />
  const start = () => {
    setStarted(true)
    check.start()
  }

  return (
    <div className={'inst inst-' + variant} aria-label={copy.label}>
      <Head site={site} variant={variant} />
      <MethodTabs value={method.id} onChange={setPick} />
      <MethodPanel method={method} ctx={ctx} />
      <CookielessSwitch state={cookieless} bundled={!!method.bundled} />
      <AiCard ctx={ctx} method={method} />
      {variant === 'wizard' && !started && (
        <button type="button" className="btn primary big inst-done" onClick={start}>
          {copy.installed}
          <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      )}
      {started && <CheckPanel state={check.state} domain={site.domain} first={first} onAgain={check.start} />}
    </div>
  )
}

export default Install
