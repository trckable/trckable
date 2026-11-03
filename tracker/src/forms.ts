// Form submissions, as a goal (the forms module). The submit event only
// fires once the browser's own validation has passed, so a form that was
// refused on the spot is not counted. Search forms and forms marked
// data-trckable-ignore are left out; data-trckable-form names the goal.
// A field marked data-trckable-keep (="label", else its name) adds its value
// to the goal, at most 9 fields, each cut to 100 characters. Only plain
// text, url, search, number, select and textarea fields count, a checkbox
// ("yes") or radio (its value) only when chosen; never an email, phone, card, password,
// one-time code or anything with an "@", and never a file. An element that
// is no field is skipped, and nothing here can stop the goal itself. A file of its own, so that without the module none
// of it is bundled.
const OK = /^(text|url|search|number|select-one|textarea|checkbox|radio) (?!.*(email|tel|cc-|password|one-time))/
export function watchForms(goal: (n: string, p?: Record<string, string>) => void) {
  document.addEventListener(
    'submit',
    (e) => {
      const f = e.target as HTMLFormElement
      if (f.closest('[role=search],[data-trckable-ignore]')) return
      const p: Record<string, string> = {}
      let n = 0
      f.querySelectorAll<HTMLInputElement>('[data-trckable-keep]').forEach((i) => {
        const t = i.type
        const v = (/^(checkbox|radio)$/.test(t) ? (i.checked ? (t < 'd' ? 'yes' : i.value) : '') : i.value || '').trim().slice(0, 100)
        const k = i.dataset.trckableKeep || i.name
        if (v && k && n < 9 && OK.test(`${t} ${i.autocomplete} ${i.inputMode}`) && !v.includes('@')) {
          p[k] = v
          n++
        }
      })
      goal(f.dataset.trckableForm || 'form_submit', { ...p, form: f.id || f.getAttribute('action') || location.pathname })
    },
    true,
  )
}
