// The words of Replay's speed menu: a lazy chunk, so none of this is carried by the first load
// (copy.ts has the rest).
import { defineCopy } from '../../i18n'

export const speedCopy = defineCopy('overview.speed', {
  speed: 'Replay speed',
  speedNow: (name: string) => `Replay speed: ${name}`,
  playsIn: (time: string) => `plays in ${time}`,
  speedKeys: 'Slower [  Faster ]',
})
