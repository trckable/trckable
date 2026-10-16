// A milestone told in full, from the bell: what was passed and when, the days before it as a climb, and the way to see that
// day in the Briefing. Its own chunk: only a tap on a milestone loads it.
import { useEffect, useState } from 'react'
import PinModal from '../../features/moments/PinModal'
import { pinsFromMilestones } from '../../features/moments/pins'
import { api, type Milestone, type Point, type Site } from '../../lib/api'
import { addDays, todayIn } from '../../lib/dates'
import { fmtMoney } from '../../lib/format'
import { navigate } from '../../lib/url'

export default function MilestoneSheet({ site, m, onClose }: { site: Site; m: Milestone; onClose: () => void }) {
  const [series, setSeries] = useState<readonly Point[]>([])
  useEffect(() => {
    const ac = new AbortController()
    const today = todayIn(site.timezone)
    const to = addDays(m.day, 7) > today ? today : addDays(m.day, 7)
    api
      .report(site.id, { from: addDays(m.day, -13), to, bucket: 'day' }, ac.signal)
      .then((r) => setSeries(r.current.series ?? []))
      .catch(() => {})
    return () => ac.abort()
  }, [site.id, site.timezone, m.day])
  const [pin] = pinsFromMilestones([{ ...m, new: true }])
  return (
    <PinModal
      pin={pin}
      site={site}
      series={series}
      money={(minor) => fmtMoney(minor, m.currency ?? site.currency, 2)}
      onClose={onClose}
      onSee={() => {
        onClose()
        navigate(`/${encodeURIComponent(site.domain)}?view=briefing&period=custom&from=${m.day}&to=${m.day}`)
      }}
    />
  )
}
