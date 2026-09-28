// Who this visitor is, at a glance: their generated face, where and on what,
// new or returning, and the numbers of their whole history — with what they
// paid, and the visit it is credited to, when they bought.
import { Avatar } from '../../components/visitor/Avatar'
import { DeviceIcon } from '../../components/visitor/DeviceIcon'
import { countryName, flag, fmtDuration, fmtInt, fmtMoney } from '../../lib/format'
import { copy } from './copy'
import type { Identity } from './model'
import { SourceChip, type OnFilter } from './SourceChip'
import { fmtDate, fmtDayTime, isoOf } from './when'

function Fact({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className ? 'jr-fact ' + className : 'jr-fact'}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function Place({ who }: { who: Identity }) {
  if (!who.country) return <span>{copy.unknownPlace}</span>
  return (
    <span title={countryName(who.country)}>
      <span aria-hidden="true">{flag(who.country)}</span> {countryName(who.country)}
    </span>
  )
}

function Tech({ who }: { who: Identity }) {
  const parts = [who.device, who.browser, who.os].filter(Boolean)
  if (parts.length === 0) return <span>{copy.unknownDevice}</span>
  return (
    <span>
      <DeviceIcon device={who.device} /> {parts.join(' · ')}
    </span>
  )
}

export function IdentityHead({ who, titleId }: { who: Identity; titleId: string }) {
  return (
    <div className="jr-who">
      <Avatar id={who.visitor} size={52} live={who.live} />
      <div className="jr-who-text">
        <h2 id={titleId}>{copy.title(who.visitor)}</h2>
        <p className="jr-who-line faint">
          <Place who={who} />
          <Tech who={who} />
        </p>
        <p className="jr-badges">
          <span className={who.returning ? 'jr-badge returning' : 'jr-badge'}>{who.returning ? copy.returning : copy.new}</span>
        </p>
      </div>
    </div>
  )
}

export function IdentityFacts({ who, currency, onFilter }: { who: Identity; currency: string; onFilter?: OnFilter }) {
  return (
    <dl className="jr-facts">
      <Fact label={copy.firstSeen}>
        <time className="num" dateTime={isoOf(who.firstSeen)}>
          {fmtDate(who.firstSeen)}
        </time>
      </Fact>
      <Fact label={copy.lastSeen}>
        <time className="num" dateTime={isoOf(who.lastSeen)}>
          {fmtDayTime(who.lastSeen)}
        </time>
      </Fact>
      <Fact label={copy.visits}>
        <span className="num">{fmtInt(who.visits)}</span>
      </Fact>
      <Fact label={copy.timeOnSite}>
        <span className="num">{fmtDuration(who.totalS)}</span>
      </Fact>
      {who.paid > 0 && (
        <Fact label={copy.paid} className="money">
          <span className="jr-money num">{fmtMoney(who.paid, currency, 2)}</span>
          {who.refunded > 0 && <span className="faint num jr-refund">{copy.refunded(fmtMoney(who.refunded, currency, 2))}</span>}
          {who.source && (
            <span className="jr-credit">
              <span className="faint">{copy.creditedTo}</span>
              <SourceChip channel={who.source.channel} referrer={who.source.referrer} onFilter={onFilter} />
            </span>
          )}
        </Fact>
      )}
    </dl>
  )
}
