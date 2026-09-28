// Every word the picture cropper shows, in one place: this is what moves to
// the message files when translations come.
export const copy = {
  title: 'Your picture',
  hint: 'Drag it into place and zoom until it looks right.',
  stage: 'Picture position',
  keys: 'Arrow keys move the picture, Shift moves it further, + and − zoom, Home centres it.',
  zoom: 'Zoom',
  zoomValue: (percent: number) => `${percent}%`,
  center: 'Center',
  centered: 'Centred',
  cancel: 'Cancel',
  save: 'Save picture',
  saving: 'Saving…',
  saved: 'Saved',
  noCanvas: 'Could not make the picture — try another file.',
  damaged: (name: string, kind: string) => `${name} could not be read. It may be damaged, or not really a ${kind} — try saving it again.`,
  unknown: (name: string) => `${name} is not a picture this browser can open. Use a PNG, JPEG, WebP or GIF.`,
  heic: (name: string) =>
    `${name} is not a picture this browser can open. Use a PNG, JPEG, WebP or GIF — an iPhone photo (HEIC) can be exported as JPEG from Photos first.`,
}
