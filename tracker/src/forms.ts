// Form submissions, as a goal (the forms module). The submit event only
// fires once the browser's own validation has passed, so a form that was
// refused on the spot is not counted. Search forms and forms marked
// data-trckable-ignore are left out; data-trckable-form names the goal.
// A file of its own, so that without the module none of it is bundled.
export function watchForms(goal: (n: string, p?: Record<string, string>) => void) {
  document.addEventListener(
    'submit',
    (e) => {
      const f = e.target as HTMLFormElement
      if (!f.closest('[role=search],[data-trckable-ignore]'))
        goal(f.dataset.trckableForm || 'form_submit', { form: f.id || f.getAttribute('action') || location.pathname })
    },
    true,
  )
}
