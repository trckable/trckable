// Cookie consent while it is not asked for: what it does, and the one button
// that starts it. It stays in Data & privacy, with the rest of what a visitor
// is promised.
import { useState } from 'react'
import { confirm } from '../components/Confirm'
import { Info } from '../components/Info'
import { fail, more, type Site } from '../lib/apiMore'
import { can } from '../lib/permissions'
import { recordsCopy } from './recordsCopy'

export function ConsentOff({ site, onOn }: { site: Site; onOn: () => void }) {
  const [turning, setTurning] = useState(false)
  const turnOn = async () => {
    if (!(await confirm({ title: recordsCopy.consent.title, body: recordsCopy.consent.body, confirmLabel: recordsCopy.consent.button }))) return
    setTurning(true)
    more
      .setModule(site.id, 'consent', true)
      .then(() => {
        onOn()
      })
      .catch((e: unknown) => fail(e))
      .finally(() => setTurning(false))
  }
  return (
    <section className="card" id="consent" style={{ gap: 12 }}>
      <div className="card-head">
        <h2>Cookie consent</h2>
        <Info text="For sites that want the cookie and the returning-visitor numbers that come with it, and are willing to ask first. Cookieless mode above is the other answer: no cookie, and nothing stored on the device. A visitor who declines your banner is never counted, and the first page waits for their answer." />
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
        Keep the cookie and ask first. trckable can read the consent manager you already run, or ask with a small bar of its own — about its one cookie and nothing else.
      </p>
      <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} disabled={turning || !can('site.settings')} onClick={() => void turnOn()}>
        {recordsCopy.consent.button}
      </button>
    </section>
  )
}
