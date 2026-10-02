import type { Plugin } from 'vite'

// The logo's font (brand/logo.css) is written there as a data: URI, so the one
// logo file works anywhere it is copied. In the dashboard build that font
// leaves the first-load stylesheet for a file of its own: hashed like every
// asset (so a visit after it keeps it cached), asked for in the page's head
// beside the script (so it is there before the logo is first drawn), and
// without it the stylesheet is 2.3 KB lighter. The CSS source is untouched.
const DATA = /url\(data:font\/woff2;base64,([A-Za-z0-9+/=]+)\)/

// FNV-1a: eight hex digits, like every other hash in the build.
const hash8 = (s: string) => {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return (h >>> 0).toString(16).padStart(8, '0')
}

export function wordmarkFont(): Plugin {
  let font = ''
  const file = () => `assets/tkb-wordmark-${hash8(font)}.woff2`
  return {
    name: 'wordmark-font',
    apply: 'build',
    enforce: 'pre',
    // Before Vite reads the CSS, so the stylesheet's own hash says what is in it.
    transform(code, id) {
      const m = id.endsWith('/brand/logo.css') ? DATA.exec(code) : null
      if (!m) return null
      font = m[1]
      this.emitFile({ type: 'asset', fileName: file(), source: Uint8Array.from(atob(font), (c) => c.charCodeAt(0)) })
      return code.replace(DATA, `url(/${file()})`)
    },
    transformIndexHtml: () => (font ? [{ tag: 'link', injectTo: 'head', attrs: { rel: 'preload', href: `/${file()}`, as: 'font', type: 'font/woff2', crossorigin: '' } }] : []),
  }
}
