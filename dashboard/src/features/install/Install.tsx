// The install flow, one compact component wherever a site still needs its script: the
// add-site wizard's Install step, the setup screen of a site with no visit yet, the
// first run's card and Settings → Install. Pick a method, copy the code (or the AI
// prompt), and the check and then the first visit arrive. The wizard owns its footer
// ("I've installed it"), so the check can be handed in.
// Loaded on demand: only new sites and the wizard ever show it.
import { useEffect, useState } from 'react'
import type { Site, Visit } from '../../lib/api'
import type { Ctx } from '../../lib/install'
import { AiCard } from './AiCard'
import { CheckPanel } from './CheckPanel'
import { CookielessSwitch } from './CookielessSwitch'
import { aiPrompt, copy } from './copy'
import { MethodPanel } from './MethodPanel'
import { MethodTabs } from './MethodTabs'
import { methodOf } from './snippet'
import { tabToShow, useStack } from './stack'
import { useCookieless, type Cookieless } from './useCookieless'
import type { InstallCheckHandle } from './useInstallCheck'
import './install.css'

export type Variant = 'wizard' | 'settings' | 'setup'

/** What the setup screen's status card needs from the open tab: the AI prompt for it, and whether its code is bundled. */
export type Extras = { prompt: string; bundled: boolean }

/** ?method=wordpress opens on that platform: the docs link straight to it. */
function firstMethod(): string {
  const wanted = new URLSearchParams(location.search).get('method')
  return wanted ? methodOf(wanted).id : 'script'
}

function Head({ site, variant }: { site: Site; variant: Variant }) {
  if (variant !== 'settings') return null
  return <h2 className="inst-title-small">{copy.titleSettings(site.domain)}</h2>
}

type Props = { site: Site; visits: Visit[]; variant?: Variant; check?: InstallCheckHandle; cookieless?: Cookieless; onExtras?: (x: Extras) => void }

export function Install({ site, visits, variant = 'wizard', check, cookieless: given, onExtras }: Props) {
  const [pick, setPick] = useState(firstMethod)
  // A tab chosen by hand, or named in the address, is never moved by what the site turns out to run.
  const [chosen, setChosen] = useState(() => new URLSearchParams(location.search).has('method'))
  const stack = useStack(site.id)
  const own = useCookieless(site.id)
  const cookieless = given ?? own
  const first = visits[0]
  // The proxy key is a credential, so the server sends it to owners only.
  // A viewer still sees the recipe, with the key named rather than spelled out.
  const ctx: Ctx = { host: location.origin, site: site.id, domain: site.domain, proxyKey: site.proxy_key || 'your-proxy-key', cookieless: cookieless.on === true }
  const method = methodOf(tabToShow(pick, chosen, stack))
  const choose = (id: string) => {
    setChosen(true)
    setPick(id)
  }

  const prompt = aiPrompt(ctx, method)
  const bundled = !!method.bundled
  useEffect(() => onExtras?.({ prompt, bundled }), [onExtras, prompt, bundled])

  return (
    <section className={'inst inst-compact inst-' + variant} aria-label={copy.label}>
      <Head site={site} variant={variant} />
      {stack && (
        <p className="inst-stack" role="status">
          {copy.runs(site.domain, methodOf(stack).name)}
        </p>
      )}
      <MethodTabs value={method.id} onChange={choose} />
      <MethodPanel method={method} ctx={ctx} />
      {variant !== 'setup' && (
        <div className="inst-extras">
          <CookielessSwitch state={cookieless} bundled={bundled} />
          <AiCard prompt={prompt} />
        </div>
      )}
      {check && check.state.phase !== 'idle' && <CheckPanel state={check.state} domain={site.domain} first={first} onAgain={check.start} />}
    </section>
  )
}

export default Install
