// "Send me this week's email now" in Settings → Alerts: the weekly report goes
// to the address of the person who pressed it, three times a day at most (the
// server counts). It does not change when the scheduled one is sent.
import { Mail } from 'lucide-react'
import { useState } from 'react'
import { call, fail } from '../lib/api'
import { toast } from '../components/Toast'

const copy = {
  button: 'Send me this week’s email now',
  busy: 'Sending…',
  sent: (to: string) => `Sent to ${to}`,
}

export function WeeklyNow({ site }: { site: string }) {
  const [busy, setBusy] = useState(false)
  const send = () => {
    setBusy(true)
    call<{ sent_to: string }>('POST', `/sites/${encodeURIComponent(site)}/alerts/weekly/send`)
      .then((r) => toast(copy.sent(r.sent_to)))
      .catch((e: unknown) => fail(e))
      .finally(() => setBusy(false))
  }
  return (
    <button type="button" className="btn ghost al-now" disabled={busy} onClick={send}>
      <Mail size={14} strokeWidth={1.75} aria-hidden="true" />
      {busy ? copy.busy : copy.button}
    </button>
  )
}
