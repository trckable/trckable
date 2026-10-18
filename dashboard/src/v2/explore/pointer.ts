// A mouse or trackpad clicks; a finger taps. The words for "press a row" follow the device in front of the person.
import { copy } from './copy'

/** True where the main pointer is a mouse or trackpad (it hovers and is precise): desktop copy says "click". */
export const clicks = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover) and (pointer: fine)').matches

/** What a press on a row does, said in the device's verb. */
export const rowWords = () =>
  clicks()
    ? { source: copy.clickSource, page: copy.clickPage, filter: copy.clickFilter }
    : { source: copy.noteSource, page: copy.notePage, filter: copy.tapFilter }
