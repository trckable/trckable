// Which robot read which page, for the kind on show.
import { useState } from 'react'
import type { CrawlerReport } from '../../lib/api'
import { fmtInt } from '../../lib/format'
import { colorOf } from './colors'
import { copy, OTHER } from './copy'

type Read = NonNullable<CrawlerReport['reads']>[number]

const pageOf = (path: string) => (path === OTHER ? copy.other : path)

export function CrawlerReads({ reads }: { reads: Read[] }) {
  // A long path is cut to fit; tap (or Enter on) it to read it whole: a
  // title= never shows on a phone.
  const [open, setOpen] = useState<string | null>(null)
  if (reads.length === 0) return null
  return (
    <table className="crawl-reads">
      <caption className="faint">{copy.pages}</caption>
      <thead className="faint">
        <tr>
          <th scope="col">{copy.page}</th>
          <th scope="col">{copy.bot}</th>
          <th scope="col" className="num">{copy.hits}</th>
        </tr>
      </thead>
      <tbody>
        {reads.map((r) => {
          const key = r.path + '\u0000' + r.name
          const whole = open === key
          return (
            <tr key={key}>
              <td className={whole ? 'crawl-path whole' : 'crawl-path'}>
                <button type="button" className="crawl-path-btn" aria-expanded={whole} onClick={() => setOpen(whole ? null : key)}>
                  {pageOf(r.path)}
                </button>
              </td>
              <td>
                <span className="dot" style={{ background: colorOf(r.name) }} aria-hidden="true" />
                {r.name}
              </td>
              <td className="num">{fmtInt(r.hits)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
