// The dialog behind the heatmaps card: the page and today's views of it by the hour, what a heatmap
// shows (nobody is recorded), a preview on example data, and the way to turn it on.
import { Flame } from 'lucide-react'
import { useEffect, useState } from 'react'
import { CardModal } from '../../components/CardModal/CardModal'
import { cardModal } from '../../components/CardModal/copy'
import { busiest, Meaning, Part, Spark } from '../../components/CardModal/parts'
import { api } from '../../lib/api'
import { fmtDay, todayIn } from '../../lib/dates'
import { fmtInt } from '../../lib/format'
import { heatCopy } from './copy'

const t = heatCopy.card

/** Today's views of one page, hour by hour (the report the dashboard already has). */
function useHours(site: string, tz: string, path: string): number[] {
  const [got, setGot] = useState<number[]>([])
  useEffect(() => {
    const ctl = new AbortController()
    const today = todayIn(tz)
    api
      .report(site, { from: today, to: today, bucket: 'hour', filters: [{ dim: 'page', value: path }] }, ctl.signal)
      .then((r) => setGot(r.current.series.map((p) => p.pageviews)))
      .catch(() => {})
    return () => ctl.abort()
  }, [site, tz, path])
  return got
}

export default function HeatModal({ site, path, views, onClose, onPreview, onGo }: { site: { id: string; timezone: string }; path: string; views: number; onClose: () => void; onPreview: () => void; onGo: () => void }) {
  const hours = useHours(site.id, site.timezone, path)
  const today = todayIn(site.timezone)
  return (
    <CardModal
      label={t.label}
      kind={{ icon: <Flame size={14} strokeWidth={2} />, label: t.label, tint: 'var(--ch-2)' }}
      when={{ text: fmtDay(today), title: fmtDay(today, { weekday: true }) }}
      title={
        <>
          {fmtInt(views)}
          <small>{t.views}</small>
        </>
      }
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn ghost" onClick={onPreview}>
            {t.preview}
          </button>
          <button type="button" className="btn primary" onClick={onGo}>
            {t.go}
          </button>
        </>
      }
    >
      <Part title={path}>{hours.length > 1 ? <Spark values={hours} hl={busiest(hours)} label={t.byHour} /> : <p className="faint">{cardModal.none}</p>}</Part>
      <Meaning>{t.body}</Meaning>
    </CardModal>
  )
}
