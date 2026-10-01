// The accounts shared with this person: the ones they joined, each with a way
// to leave. Their own (the first owner's) is not listed: it cannot be left.
// Nothing shows for a person in a single account.
import { Users } from 'lucide-react'
import { confirm } from '../../components/Confirm'
import { toast } from '../../components/Toast'
import { view } from '../../lib/accountView'
import { call, messageOf } from '../../lib/api'
import { Line } from '../AccountLine'
import { shared } from './sharedCopy'

export function SharedWith() {
  const list = view.list
  const joined = list.filter((a) => !a.holder)
  if (list.length < 2 || joined.length === 0) return null
  const leave = async (id: string, name: string) => {
    if (!(await confirm({ title: shared.title(name), body: shared.body, confirmLabel: shared.leave, danger: true }))) return
    try {
      await call('POST', '/me/leave', { account: id })
      location.assign('/')
    } catch (e) {
      toast(messageOf(e))
    }
  }
  return (
    <section className="card acct-group">
      <h2 className="acct-title">{shared.head}</h2>
      {joined.map((a) => (
        <Line key={a.id} icon={Users} label={a.name} hint={shared.hint(a.role, a.total)}>
          <button type="button" className="btn" onClick={() => void leave(a.id, a.name)}>
            {shared.leave}
          </button>
        </Line>
      ))}
    </section>
  )
}
