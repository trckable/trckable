// With cookies against cookieless, one row per thing that changes. The column
// the site is going to is marked; going back to cookies swaps the columns, so
// the table always reads from what it is now to what it becomes.
import { Check, Minus, X } from 'lucide-react'
import { copy, type Tone } from './copy'

const t = copy.cookieless
const ICON = { yes: Check, meh: Minus, no: X }

function Cell({ v: [text, tone], to }: { v: [string, Tone]; to: boolean }) {
  const Icon = ICON[tone]
  return (
    <td className={to ? 'cl-to' : undefined} data-tone={tone}>
      <Icon size={14} strokeWidth={2.4} aria-hidden="true" />
      {text}
    </td>
  )
}

export function CookielessTable({ toCookies }: { toCookies: boolean }) {
  const cols = [
    { key: 'cookies', head: t.colCookies },
    { key: 'cookieless', head: t.colCookieless },
  ] as const
  const [from, to] = toCookies ? [cols[1], cols[0]] : cols
  return (
    <table className="cl-table">
      <thead>
        <tr>
          <td />
          <th scope="col">{from.head}</th>
          <th scope="col" className="cl-to">
            {to.head}
          </th>
        </tr>
      </thead>
      <tbody>
        {t.rows.map((r) => (
          <tr key={r.label}>
            <th scope="row">{r.label}</th>
            <Cell v={r[from.key]} to={false} />
            <Cell v={r[to.key]} to />
          </tr>
        ))}
      </tbody>
    </table>
  )
}
