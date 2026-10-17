// The saved theme, before the page paints: the dashboard's own script comes after the first frame, and
// a person who chose Light would see one dark frame first. Nothing is read but the choice, and a browser
// that blocks storage gets the system's own theme (src/lib/theme.ts applies the same choice again).
try {
  var t = localStorage.getItem('trckable:theme')
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t
} catch (e) {
  /* storage blocked */
}
// The same for the page's shape: a browser that has been signed in keeps the names of its sites
// (src/lib/bootCache.ts), so a refresh of a dashboard address paints the dashboard's own boxes, with the
// site's name in them, instead of a loading ghost, and the app draws the same boxes until it knows more.
// Sign-in, setup, shared links and the other pages keep the ghost. data-boot says which shape shows.
(function () {
  try {
    var b = JSON.parse(localStorage.getItem('trckable:boot') || 'null')
    var path = location.pathname
    var named = /^\/([^/]+)\/?$/.exec(path)
    if (b && b.s && b.s.length && (path === '/' || (named && !/^(login|setup|s|settings|sites|api)$/.test(named[1])))) {
      var domain = named ? decodeURIComponent(named[1]) : ''
      var site = null
      for (var i = 0; i < b.s.length; i++) if (domain ? b.s[i].d === domain : !site) site = site || b.s[i]
      if (site) {
        // Live is the default for a site that has had visits, when the address says nothing else (lib/url.ts wantsLive).
        var q = location.search
        var live = /[?&]view=live/.test(q) || ((q === '' || q === '?') && site.e === 1)
        var root = document.documentElement
        root.dataset.boot = live ? 'live' : 'story'
        root.style.setProperty('--dsk-name', JSON.stringify(site.n || site.d))
        if (b.k) root.dataset.ask = ''
        // The story's boxes were this tall (px) when last drawn at this width, so the boxes hold the same space.
        if (b.w === innerWidth) {
          var gaps = { head: b.h, setup: b.u, tile: b.t, chart: b.c }
          for (var k in gaps) if (gaps[k] > 0) root.style.setProperty('--dsk-' + k, gaps[k] + 'px')
          for (var j = 0; b.a && j < b.a.length; j++) if (b.a[j] > 0) root.style.setProperty('--dsk-a' + (j + 1), b.a[j] + 'px')
        }
      }
    }
  } catch (e) {
    /* nothing kept, or storage blocked: the ghost */
  }
})()
