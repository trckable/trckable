// Form submissions, as a goal (the forms module). The submit event only
// fires once the browser's own validation has passed, so a form that was
// refused on the spot is not counted. Search forms and forms marked
// data-trckable-ignore are left out; data-trckable-form names the goal. A
// field marked data-trckable-keep (="label", else its name) adds its value to
// the goal, never a password, email, phone or hidden field, cut to 100 chars.
// A file of its own, so that without the module none of it is bundled.
export function watchForms(goal: (n: string, p?: Record<string, string>) => void) {
  document.addEventListener(
    'submit',
    (e) => {
      const f = e.target as HTMLFormElement
      if (f.closest('[role=search],[data-trckable-ignore]')) return
      const p: Record<string, string> = {}
      f.querySelectorAll<HTMLInputElement>('[data-trckable-keep]').forEach((i) => {
        const v = /^(password|email|tel|hidden)$/.test(i.type) ? '' : i.value.trim().slice(0, 100)
        const k = i.dataset.trckableKeep || i.name
        if (v && k) p[k] = v
      })
      goal(f.dataset.trckableForm || 'form_submit', { ...p, form: f.id || f.getAttribute('action') || location.pathname })
    },
    true,
  )
}
