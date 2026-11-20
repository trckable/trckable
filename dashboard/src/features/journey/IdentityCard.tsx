// Who this visitor is, at a glance: their generated face over a soft band of their own colour, how they came (system
// and browser or app, each with its mark), where from, how many visits and how long, and what they paid.
import { Avatar } from '../../components/visitor/Avatar'
import { DeviceIcon } from '../../components/visitor/DeviceIcon'
import { nameOf } from '../../lib/visitor'
import { appLine } from '../apps/copy'
import { countryName, fmtDuration, fmtInt, fmtMoney } from '../../lib/format'
import { Flag } from '../../v2/ui/Flag'
import { copy } from './copy'
import { HowMark, howOf, OsMark } from './Marks'
import type { Identity } from './model'
import { SourceChip, type OnFilter } from './SourceChip'
import { fmtDate } from './when'

function summary(who: Identity, zone?: string): string {
  if (who.visits <= 1) return copy.firstVisit(fmtDuration(who.totalS))
  return copy.visitsSince(fmtInt(who.visits), fmtDate(who.firstSeen, zone), fmtDuration(who.totalS))
}

export function Place({ who }: { who: Identity }) {
  if (!who.country) return <span>{copy.unknownPlace}</span>
  return (
    <span title={countryName(who.country)}>
      <Flag code={who.country} /> {countryName(who.country)}
    </span>
  )
}

const PHONE = new Set(['Mobile', 'Tablet'])

/** The words of the device line. A phone or tablet whose system is known drops
 *  the word "Mobile" (the system says it) and ends with how it opened the site:
 *  the browser, "In an app", or the social app. A desktop keeps its browser. */
export function techParts(who: Pick<Identity, 'device' | 'browser' | 'os' | 'app'>): string[] {
  if (PHONE.has(who.device) && who.os) return [who.os, who.app ? appLine(who.app) : who.browser].filter(Boolean)
  return [who.device, who.app && PHONE.has(who.device) ? appLine(who.app) : who.browser, who.os].filter(Boolean)
}

export function Tech({ who }: { who: Identity }) {
  const parts = techParts(who)
  if (parts.length === 0) return <span>{copy.unknownDevice}</span>
  return (
    <span>
      <DeviceIcon device={who.device} /> {parts.join(' · ')}
    </span>
  )
}

export function IdentityHead({ who, titleId, zone }: { who: Identity; titleId: string; zone?: string }) {
  const how = howOf(who)
  const system = who.os || who.device
  return (
    <div className="jr-who" style={{ ['--v-hue' as string]: String(who.hue) }}>
      <Avatar id={who.visitor} size={52} live={who.live} />
      <div className="jr-who-text">
        <h2 id={titleId}>{nameOf(who.visitor)}</h2>
        {(system || how.text) && (
          <p className="jr-how">
            {system && (
              <span className="jr-how-part">
                {who.os ? <OsMark os={who.os} /> : <DeviceIcon device={who.device} size={15} />}
                <span>{system}</span>
              </span>
            )}
            <span className="jr-how-part">
              <HowMark x={who} />
              <b>{how.text}</b>
            </span>
          </p>
        )}
        <p className="jr-who-line faint">
          {who.country && (
            <span title={countryName(who.country)}>
              <Flag code={who.country} /> {countryName(who.country)}
            </span>
          )}
          <span className="num">{summary(who, zone)}</span>
        </p>
      </div>
    </div>
  )
}

/** What they paid, and the visit it is credited to: only for someone who bought. */
export function Paid({ who, currency, onFilter }: { who: Identity; currency: string; onFilter?: OnFilter }) {
  if (who.paid <= 0) return null
  return (
    <p className="jr-paid">
      <span className="faint">{copy.paid}</span>
      <b className="jr-money num">{fmtMoney(who.paid, currency, 2)}</b>
      {who.refunded > 0 && <span className="faint num">{copy.refunded(fmtMoney(who.refunded, currency, 2))}</span>}
      {who.source && (
        <span className="jr-credit">
          <span className="faint">{copy.creditedTo}</span>
          <SourceChip channel={who.source.channel} referrer={who.source.referrer} at={who.lastSeen} onFilter={onFilter} />
        </span>
      )}
    </p>
  )
}
