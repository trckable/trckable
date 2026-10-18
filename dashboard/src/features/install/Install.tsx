// The install flow, one compact component wherever a site still needs its script: the
// add-site wizard's Install step, the setup screen of a site with no visit yet, the
// first run's card and Settings → Install. Pick a method, copy the code (or the AI
// prompt), and the check and then the first visit arrive. The wizard owns its footer
// ("I've installed it"), so the check can be handed in.
// Loaded on demand: only new sites and the wizard ever show it.
import { useState, type ReactNode } from 'react'
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
import type { InstallCheckHandle } from './useInstallCheck'
import { WaitingCard } from './WaitingCard'
import './install.css'

export type Variant = 'card' | 'wizard' | 'settings' | 'setup'

/** ?method=wordpress opens on that platform: the docs link straight to it. */
function firstMethod(): string {
  const wanted = new URLSearchParams(location.search).get('method')
  return wanted ? methodOf(wanted).id : 'script'
}

function Head({ site, variant }: { site: Site; variant: Variant }) {
  if (variant !== 'settings') return null
  return <h2 className="inst-title-small">{copy.titleSettings(site.domain)}</h2>
}

export function Install({ site, visits, variant = 'card', setup, after, check }: { site: Site; visits: Visit[]; variant?: Variant; setup?: boolean; after?: ReactNode; check?: InstallCheckHandle }) {
  const [pick, setPick] = useState(firstMethod)
  const cookieless = useCookieless(site.id)
  const first = visits[0]
  // The proxy key is a credential, so the server sends it to owners only.
  // A viewer still sees the recipe, with the key named rather than spelled out.
  const ctx: Ctx = { host: location.origin, site: site.id, domain: site.domain, proxyKey: site.proxy_key || 'your-proxy-key', cookieless: cookieless.on === true }
  const method = methodOf(pick)
  if (variant === 'card') return <WaitingCard site={site} visits={visits} ctx={ctx} pick={pick} onPick={setPick} setup={setup} after={after} />

  return (
    <div className={'inst inst-compact inst-' + variant} aria-label={copy.label}>
      <Head site={site} variant={variant} />
      <MethodTabs value={method.id} onChange={setPick} />
      <MethodPanel method={method} ctx={ctx} />
      <div className="inst-extras">
        <CookielessSwitch state={cookieless} bundled={!!method.bundled} />
        <AiCard ctx={ctx} method={method} />
      </div>
      {check && check.state.phase !== 'idle' && <CheckPanel state={check.state} domain={site.domain} first={first} onAgain={check.start} />}
      {after}
    </div>
  )
}

export default Install
