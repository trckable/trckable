// The saved theme, before the page paints: the dashboard's own script comes after the first frame, and
// a person who chose Light would see one dark frame first. Nothing is read but the choice, and a browser
// that blocks storage gets the system's own theme (src/lib/theme.ts applies the same choice again).
try {
  var t = localStorage.getItem('trckable:theme')
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t
} catch (e) {
  /* storage blocked */
}
