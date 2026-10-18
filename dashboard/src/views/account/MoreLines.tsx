// The account window's lines for what the avatar menu used to hold: the language, the Features list, installing the
// app and leaving this browser out of a site's counts. Each is also in the ⌘K palette (v2/explore/palette.ts).
import { useState } from 'react'
import { Eye, EyeOff, Languages, Smartphone, Sparkle } from 'lucide-react'
import { canLeaveOut, choose, nextChoice, stateOf } from '../../features/exclude/ownVisits'
import { openFeatures } from '../../features/hub/openFeatures'
import { chooseLang, chosen } from '../../i18n/choose'
import { LANGUAGES } from '../../i18n/languages'
import type { Site } from '../../lib/api'
import { install, useWayToInstall } from '../../lib/installApp'
import { siteForSegment } from '../../lib/siteRoute'
import { toast } from '../../components/toastBus'
import { copy as items } from '../../components/itemsCopy'
import { Line } from '../AccountLine'
import { copy } from './copy'

export function LanguageLine() {
  const now = chosen()
  const options = [{ code: 'auto', name: items.languageAuto }, ...LANGUAGES]
  return (
    <Line icon={Languages} label={items.language} hint={copy.lines.languageHint}>
      {/* Choosing starts the page again in the new language (i18n/choose.ts). */}
      <select className="input" aria-label={items.language} value={now} onChange={(e) => chooseLang(e.target.value)}>
        {options.map((o) => (
          <option key={o.code} value={o.code} lang={o.code === 'auto' ? undefined : o.code}>
            {o.name}
          </option>
        ))}
      </select>
    </Line>
  )
}

// What the pop-up writes when it is opened (features/hub/seen.ts): the same key and value, kept here so the window does not need that file.
const unseen = (user: string) => {
  try {
    return localStorage.getItem(`trckable:features:${user}`) !== '1'
  } catch {
    return false
  }
}

export function FeaturesLine({ user }: { user: string }) {
  const [fresh] = useState(() => unseen(user))
  return (
    <Line icon={Sparkle} label={items.features} hint={copy.lines.featuresHint}>
      {fresh && <span className="tag on">{copy.lines.new}</span>}
      <button type="button" className="btn ghost small" aria-label={fresh ? items.featuresNew : items.features} onClick={() => openFeatures()}>
        {copy.lines.open}
      </button>
    </Line>
  )
}

/** Install the app: the browser's own dialog, or on iOS the way through Share. Only where it can be done. */
export function InstallLine() {
  const way = useWayToInstall()
  if (!way) return null
  return (
    <Line icon={Smartphone} label={items.install} hint={way === 'ios' ? items.installHint : copy.lines.installHint}>
      <button type="button" className="btn ghost small" onClick={() => (way === 'ios' ? toast(items.installHint, 'info') : void install())}>
        {items.install}
      </button>
    </Line>
  )
}

/** Leave this browser out of the site's counts, or count it again: opens the site, where the tracker keeps the choice. The site on screen under the window; none, no card. */
export function OwnVisitsCard({ sites }: { sites: Site[] }) {
  const [, again] = useState(0)
  const site = siteForSegment(sites, location.pathname.slice(1))
  if (!site || !canLeaveOut(site)) return null
  const state = stateOf(site)
  const next = nextChoice(state)
  return (
    <section className="card acct-group">
      <h2 className="acct-title">{copy.lines.privacy}</h2>
      <Line icon={next === 'ignore' ? EyeOff : Eye} label={copy.lines.ownVisits} hint={copy.lines.ownVisitsHint[state ?? 'unknown']}>
        <button
          type="button"
          className="btn ghost small"
          onClick={() => {
            choose(site, next)
            again((n) => n + 1)
          }}
        >
          {next === 'ignore' ? copy.lines.leave : copy.lines.again}
        </button>
      </Line>
    </section>
  )
}
