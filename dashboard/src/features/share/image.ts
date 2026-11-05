// A card as a picture, handed on: saved as a file, put on the clipboard, or given to the phone's share sheet.
// One place for the share dialog and the milestone sheet.

import { copy } from './copy'

async function pngOf(url: string): Promise<Blob> {
  const r = await fetch(url, { credentials: 'same-origin' })
  if (!r.ok) throw new Error(copy.failed)
  return r.blob()
}

/** The picture as a file the browser saves under `name`. */
export async function saveImage(url: string, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(await pngOf(url))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export const canCopyImage = () => typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write

/** The picture on the clipboard. */
export async function copyImage(url: string) {
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngOf(url) })])
}

/** Whether this browser's share sheet takes a picture (phones and some desktops). */
export function canShareImage(): boolean {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([], 'a.png', { type: 'image/png' })] })
  } catch {
    return false
  }
}

/** The picture to the share sheet; closing the sheet is not an error. */
export async function shareImage(url: string, name: string, title: string) {
  const file = new File([await pngOf(url)], name, { type: 'image/png' })
  try {
    await navigator.share({ files: [file], title })
  } catch (e) {
    if (!(e instanceof DOMException && e.name === 'AbortError')) throw e
  }
}
