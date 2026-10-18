// A deleted note can be brought back for as long as its toast is up: the same day and words, added again.
import { toast } from '../../components/Toast'
import { fail, more, type Annotation } from '../../lib/apiMore'
import { copy } from './listCopy'

export function noteRemoved(site: string, n: Pick<Annotation, 'day' | 'text'>, changed: () => void) {
  toast(copy.removed, 'success', {
    label: copy.undo,
    run: () => void
      more
        .addAnnotation(site, n.day, n.text)
        .then(() => {
          toast(copy.restored)
          changed()
        })
        .catch((e: unknown) => fail(e)),
  })
}
