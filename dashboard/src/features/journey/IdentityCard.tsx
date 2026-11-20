// Who this visitor is, at a glance: their generated face over a soft band of their own colour, how they came (system
// and browser or app, each with its mark), where from, how many visits and how long, and what they paid.
import { Avatar } from '../../components/visitor/Avatar'
import { DeviceIcon } from '../../components/visitor/DeviceIcon'
import { nameOf } from '../../lib/visitor'
import { appName, howKey, howName } from '../apps/copy'
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

/** The device by its own name when the system tells it: iPhone, iPad, Mac, Android phone; else the device kind. */
export function deviceName(who: Pick<Identity, 'device' | 'os'>): string {
  const os = who.os.toLowerCase()
  const tablet = who.device === 'Tablet'
  if (os === 'ios' || os === 'ipados') return tablet ? copy.ipad : copy.iphone
  if (os.startsWith('mac')) return copy.mac
  if (os === 'android') return tablet ? copy.androidTablet : copy.androidPhone
  if (os.startsWith('windows') && who.device === 'Desktop') return copy.windowsPc
  return who.device
}

/** The words of the device line. A phone or tablet whose system is known says how it
 *  opened the site in one name ("iOS browser", "Android app"), or the social app after
 *  its system. A desktop keeps its browser, and says "Desktop app" for one that is an app. */
export function techParts(who: Pick<Identity, 'device' | 'browser' | 'os' | 'app'>): string[] {
  const social = who.app && who.app !== 'browser' && who.app !== 'app' ? appName(who.app) : undefined
  if (PHONE.has(who.device) && who.os) return social ? [who.os, social] : [howName(howKey(who))]
  if (who.device === 'Desktop' && who.app === 'app') return [howName(howKey(who)), who.os].filter(Boolean)
  return [who.device, social ?? who.browser, who.os].filter(Boolean)
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
  return (
    <div className="jr-who" style={{ ['--v-hue' as string]: String(who.hue) }}>
      <Avatar id={who.visitor} size={52} live={who.live} />
      <div className="jr-who-text">
        <h2 id={titleId}>{nameOf(who.visitor)}</h2>
        <p className="jr-how">
          <span className="jr-how-part">
            {who.os ? <OsMark os={who.os} /> : <DeviceIcon device={who.device} size={15} />}
            <span>{deviceName(who)}</span>
          </span>
          {how.text && (
            <span className="jr-how-part">
              <HowMark x={who} />
              <b>{who.app === 'app' ? copy.inApp : how.detail || how.text}</b>
            </span>
          )}
        </p>
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
