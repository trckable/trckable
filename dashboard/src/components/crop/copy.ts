// Every word the picture cropper shows, in one place: this is what moves to
// the message files when translations come.
export const copy = {
  title: 'Your picture',
  hint: 'Drag it into place, then zoom.',
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
  damaged: (name: string, kind: string) => `${name} could not be read: it may be damaged, or not a real ${kind}.`,
  unknown: (name: string) => `${name} cannot be opened here. Use a PNG, JPEG, WebP or GIF.`,
  heic: (name: string) => `${name} is an iPhone photo (HEIC). Export it as JPEG first.`,
}
