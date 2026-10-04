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
  const e = left ? 'left' : 'right'
  css.textContent =
    ':host{position:fixed;bottom:max(12px,env(safe-area-inset-bottom));' + e + ':max(12px,env(safe-area-inset-' + e + '));z-index:2147483646;max-width:calc(100vw - 24px)}' +
    'iframe{display:block;border:0;max-width:100%;background:none}' +
    'button{position:absolute;top:-22px;' + (left ? 'right' : 'left') + ':-22px;width:44px;height:44px;padding:0;border:0;background:none;color:#f3f4f6;font:14px/1 system-ui,sans-serif;cursor:pointer}' +
    'button:before{content:"\\d7";display:block;width:20px;height:20px;margin:12px;border:1px solid #8b929c;border-radius:50%;background:#15161a;line-height:18px}' +
    '@media(max-width:480px){:host{transform:scale(.88);transform-origin:bottom ' + e + '}}' +
    '@media print{:host{display:none}}'
  const frame = document.createElement('iframe')
  frame.src = new URL(s.src).origin + '/w/' + q.id
  frame.width = q.w!
  frame.height = q.h!
  frame.title = 'People online'
  if (q.theme !== 'auto') frame.style.colorScheme = q.theme!
  const x = document.createElement('button')
  x.title = 'Close'
  x.setAttribute('aria-label', 'Close')
  x.onclick = () => host.remove()
  root.append(css, frame, x)
  // The card tells the page how tall it is; only its own frame is believed.
  addEventListener('message', (m) => {
    if (m.source === frame.contentWindow && m.data && m.data.type === 'trckable:h' && m.data.h > 0) frame.height = String(Math.min(m.data.h, 4000))
  })
  const show = () => {
    document.body.append(host)
    if (!matchMedia('(prefers-reduced-motion:reduce)').matches) host.animate([{ opacity: 0 }, { opacity: 1 }], 300)
  }
  document.body ? show() : document.addEventListener('DOMContentLoaded', show)
}
