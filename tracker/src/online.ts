// The corner placement for the "online" widget: a separate script, never part
// of the tracker, served as /js/<widget id>.online.js. It frames the widget's
// own page in a fixed corner, and does nothing else: no request but the frame,
// no cookie, no storage. The server adds the widget's size, theme and id as
// data attributes on this very tag, including the corner it was given in
// Settings (pos "bl"); a tag's own data-pos stands when Settings gave none
// ("bl", else bottom right). The visitor can close it for the page; it is hidden in print, and
// fades in only for people who have not asked for less motion.
//
// Budget: 1 KB gzip, checked by build.mjs and by a Go test.

const s = document.currentScript as HTMLScriptElement | null
if (s) {
  const q = s.dataset
  const left = q.pos === 'bl'
  const host = document.createElement('div')
  const root = host.attachShadow({ mode: 'open' })
  const css = document.createElement('style')
  css.textContent =
    ':host{position:fixed;bottom:16px;' + (left ? 'left' : 'right') + ':16px;z-index:2147483646;max-width:calc(100vw - 32px)}' +
    'iframe{display:block;border:0;max-width:100%;background:none}' +
    'button{position:absolute;top:-9px;' + (left ? 'right' : 'left') + ':-9px;width:20px;height:20px;padding:0;border:1px solid #8b929c;border-radius:50%;' +
    'background:#15161a;color:#f3f4f6;font:14px/1 system-ui,sans-serif;cursor:pointer}' +
    '@media print{:host{display:none}}'
  const frame = document.createElement('iframe')
  frame.src = new URL(s.src).origin + '/w/' + q.id
  frame.width = q.w!
  frame.height = q.h!
  frame.title = 'People online'
  if (q.theme !== 'auto') frame.style.colorScheme = q.theme!
  const x = document.createElement('button')
  x.textContent = '×'
  x.title = 'Close'
  x.setAttribute('aria-label', 'Close')
  x.onclick = () => host.remove()
  root.append(css, frame, x)
  const show = () => {
    document.body.append(host)
    if (!matchMedia('(prefers-reduced-motion:reduce)').matches) host.animate([{ opacity: 0 }, { opacity: 1 }], 300)
  }
  document.body ? show() : document.addEventListener('DOMContentLoaded', show)
}
