// Settings: the site's one switch for milestones. Off hides the moment and
// the timeline; the nightly check keeps running, so turning it back on
// loses nothing.
import { useEffect, useState } from 'react'
import { api, fail, type Site } from '../../lib/api'
import { isViewer } from '../../lib/me'
import { Row } from '../../components/Row'
import { shareApi } from './share'
import { Switch } from '../../components/Switch'
import { copy } from './copy'

export function MilestonesSetting({ site }: { site: Site }) {
  const [on, setOn] = useState<boolean | null>(null)
  useEffect(() => {
    api
      .milestones(site.id)
      .then((r) => setOn(r.enabled))
      .catch(() => setOn(null))
  }, [site.id])
  if (on === null) return null
  const flip = () => {
    setOn(!on)
    shareApi.setOn(site.id, !on).catch((e: unknown) => {
      setOn(on)
      fail(e)
    })
  }
  return (
    <section className="card">
      <Row label={copy.setting} hint={copy.settingHint}>
        <Switch on={on} disabled={isViewer()} onChange={flip} />
      </Row>
    </section>
  )
}
