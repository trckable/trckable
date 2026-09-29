// What an owner can do to another person: change their role, give new
// sign-in details, turn their two-step off, remove them.
import { api, type Person } from '../../lib/api'
import { confirm, confirmWith } from '../../components/Confirm'
import { toast } from '../../components/Toast'
import { people } from './peopleCopy'

type Asked = { title: string; body: string; confirmLabel: string; busyLabel: string; done?: string; danger?: boolean }

// Acting on someone else's sign-in takes your password and, when your own
// two-step is on, a code too: a borrowed owner session plus a password
// must not be enough to take another person's account. Asked one after the
// other (one dialog at a time), the code last, where the action runs.
const asOwner = async <T,>(o: Asked, act: (mine: string, code?: string) => Promise<T>) => {
  const t = people.own
  const password = { label: t.password, type: 'password', autoComplete: 'current-password' } as const
  // Not known (a failed read): ask for the code anyway; the server ignores it when two-step is off.
  const on = await api.twoStep().then((s) => s.enabled).catch(() => true)
  if (!on) return confirmWith({ ...o, field: password, run: (mine) => act(mine) })
  const mine = await confirmWith({ ...o, done: undefined, busyLabel: undefined, confirmLabel: t.next, field: password })
  if (mine === null) return null
  return confirmWith({
    ...o,
    title: t.codeTitle,
    body: t.codeBody,
    field: { label: t.code, type: 'text', autoComplete: 'one-time-code' },
    run: (code) => act(mine, code),
  })
}

export function peopleActions(o: { load: () => void; setPeople: (p: Person[]) => void; issue: (made: { email: string; password: string; reset?: boolean }) => void }) {
  // Called from the confirmation, which shows a refusal and stays open.
  const setRole = (p: Person, role: string) =>
    api.setPersonRole(p.id, role).then((r) => {
      const name = p.name || p.email.split('@')[0]
      toast(role === 'owner' ? people.change.nowOwner(name) : people.change.nowViewer(name))
      o.setPeople(r.people ?? [])
    })
  const reset = async (p: Person) => {
    const t = people.reset
    let made: { email: string; password: string } | null = null
    const pw = await asOwner({ title: t.title(p.email), body: t.body, confirmLabel: t.confirm, busyLabel: t.busy }, (mine, code) => api.resetPersonPassword(p.id, mine, code).then((r) => (made = r)))
    if (pw !== null && made) {
      o.issue({ ...(made as { email: string; password: string }), reset: true })
      o.load()
    }
  }
  // Lost phone, no recovery codes: they sign in with the password alone and
  // set two-step up again.
  const turnOff = async (p: Person) => {
    const t = people.twoStepOff
    const pw = await asOwner({ title: t.title(p.email), body: t.body, confirmLabel: t.confirm, danger: true, busyLabel: t.busy, done: t.done(p.email) }, (mine, code) => api.turnOffTwoStepFor(p.id, mine, code))
    if (pw !== null) o.load()
  }
  const remove = async (p: Person) => {
    const t = people.remove
    const ok = await confirm({ title: t.title(p.email), body: t.body, confirmLabel: t.confirm, danger: true, busyLabel: t.busy, done: t.done(p.email), run: () => api.removePerson(p.id) })
    if (ok) o.load()
  }
  return { setRole, reset, turnOff, remove }
}
