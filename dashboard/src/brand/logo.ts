// trckable's logo: the ghost peeking over its chart line, and the name.
//
// This file and logo.css are the only definition of it. The dashboard uses
// them directly; trckable.com, its docs and its legal pages get generated
// copies (trckable-cloud/scripts/logo.mjs), so the logo cannot drift apart.
//
// One behaviour everywhere: "trck" is missing its a, and the a pops in while
// a mouse is over the logo or the keyboard focuses it. Nothing plays by
// itself, and a tap on a phone leaves nothing stuck.
//
// Plain strings, no framework: Node, Vite and Next read this file as it is.

const GHOST = 'M12 30a20 20 0 0 1 40 0v22l-5-3.5-5 3.5-5-3.5-5 3.5-5-3.5-5 3.5-5-3.5-5 3.5z'
const LINE = 'M5 47l12-6 9 4 12-9 9 3 12-12'

/** The ghost alone, `size` pixels square. */
export function ghostSvg(size: number): string {
  return (
    `<svg class="tkb-ghost" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">` +
    // The ghost (body and eyes) floats as one on hover; its hem ripples.
    '<g class="tkb-boo">' +
    `<path class="tkb-body" d="${GHOST}" fill="#b8ff3c"/>` +
    '<circle cx="25.5" cy="29" r="3.6" fill="#0b0d10"/><circle cx="38.5" cy="29" r="3.6" fill="#0b0d10"/>' +
    '<circle cx="26.6" cy="27.8" r="1.1" fill="#b8ff3c"/><circle cx="39.6" cy="27.8" r="1.1" fill="#b8ff3c"/>' +
    '</g>' +
    // pathLength lets the line redraw itself on hover with one dash.
    `<path class="tkb-line-edge" d="${LINE}" pathLength="1" fill="none" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path class="tkb-line" d="${LINE}" pathLength="1" fill="none" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>` +
    '</svg>'
  )
}

/** The name in a heading or a label: the wordmark's type (bold "trck", light
 *  "able"), without the ghost and without the missing a. */
export const NAME = '<span class="tkb-name">trck<span class="tkb-able">able</span></span>'

/** Every "trckable" in a piece of HTML text, set as the name. */
export const withName = (html: string): string => html.replace(/\btrckable\b/g, NAME)

/** The name, with its missing a. */
export const WORDMARK =
  '<span class="tkb-wm" aria-hidden="true">tr<span class="tkb-a">a</span>ck<span class="tkb-able">able</span></span>'

/** Ghost and name, to go inside an element with class "tkb-logo". The logo
 *  is one size everywhere (logo.css fixes it); the element is the host's: a
 *  link, or a span with role="img" and aria-label="trckable". */
export const logoInner = (): string => ghostSvg(30) + WORDMARK
