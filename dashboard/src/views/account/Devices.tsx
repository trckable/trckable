// The phones signed in to this account, one row each, with Remove. Nothing
// shows until the app has signed in at least once.
import { Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'
import { confirm } from '../../components/Confirm'
import { type Device, more } from '../../lib/apiMore'
import { Line } from '../AccountLine'
import { ago } from './ago'
import { devices as t } from './devicesCopy'

export function Devices() {
  const [list, setList] = useState<Device[]>([])
  const load = () => void more.devices().then((r) => setList(r.devices ?? [])).catch(() => {})
  useEffect(load, [])
  const remove = async (d: Device) => {
    const ok = await confirm({
      title: t.removeTitle(d.name),
      body: t.removeBody,
      confirmLabel: t.remove,
      danger: true,
      busyLabel: t.removing,
      done: t.removed,
      run: () => more.removeDevice(d.id),
    })
    if (ok) load()
  }
  return list.map((d) => (
    <Line key={d.id} icon={Smartphone} label={d.name} hint={[t.platform[d.platform], d.current ? t.thisOne : '', t.hint(ago(d.last_used_at))].filter(Boolean).join(' · ')}>
      <button type="button" className="btn" aria-label={t.removeLabel(d.name)} onClick={() => remove(d)}>
        {t.remove}
      </button>
    </Line>
  ))
}
