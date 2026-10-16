// The locked sample of a section whose source is not connected: revenue, search or goals.
import { XLock, type LockSample } from '../../ui/XLock'
import { copy } from '../copy'
import type { Setup, XCtx } from '../ctx'

const SAMPLES: Record<Setup, LockSample> = {
  rev: {
    big: '$4,820',
    lines: [
      { name: 'Product Hunt', bar: 90, value: '$2,140' },
      { name: 'Google', bar: 60, value: '$1,310' },
      { name: 'Newsletter', bar: 40, value: '$870' },
    ],
  },
  search: {
    big: '1,240 clicks',
    lines: [
      { name: 'simple web analytics', value: '312' },
      { name: 'privacy friendly stats', value: '204' },
      { name: 'plausible alternative', value: '118' },
    ],
  },
  goals: {
    big: '3.4%',
    lines: [
      { name: 'Signup', bar: 120, value: '42' },
      { name: 'Checkout', bar: 70, value: '18' },
      { name: 'Newsletter', bar: 40, value: '9' },
    ],
  },
}

export function Lock({ k, x }: { k: Setup; x: XCtx }) {
  return <XLock text={{ ...copy.lock[k], how: copy.howWorks, tag: copy.sample }} sample={SAMPLES[k]} onSet={() => x.connect(k)} onHow={() => x.how(k)} />
}
