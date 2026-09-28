// The cookie bar's markup and stylesheet, kept in one place so the dashboard
// can preview the real thing rather than an impression of it. Two strings and
// nothing else: the behaviour lives in core.ts, and no feature flag reaches
// in here.
//
// Everything a site might change is a custom property; a site's own CSS is
// appended after this, so it wins. Inside a shadow root the selectors stay
// short: div, p, a, button, button.no.

export const BAR_STYLE =
  'div{position:fixed;z-index:2147483647;inset:var(--tkb-at,auto 12px 12px auto);max-width:var(--tkb-width,min(420px,calc(100vw - 24px)));' +
  'display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:12px 14px;border-radius:var(--tkb-round,12px);' +
  'background:var(--tkb-bg,#15161a);color:var(--tkb-fg,#f3f4f6);box-shadow:var(--tkb-shadow,0 10px 40px #00000059);font:var(--tkb-font,14px/1.45 system-ui,-apple-system,sans-serif)}' +
  'p{margin:0;flex:1 1 180px}a{color:inherit}span{display:flex;gap:8px;flex:0 0 auto}' +
  'button{padding:7px 15px;border:0;border-radius:var(--tkb-button-round,8px);background:var(--tkb-button,#f3f4f6);color:var(--tkb-button-fg,#15161a);cursor:pointer;font:inherit;font-weight:500}' +
  'button.no{background:none;color:inherit;box-shadow:inset 0 0 0 1px currentColor}'

export const BAR_HTML = '<div role="dialog" aria-label="Cookies"><p></p><span><button class="no"></button><button></button></span></div>'
