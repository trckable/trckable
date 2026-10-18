// Prototype switches for the slimmer site menu (development only): `?menu=current|a` picks the menu, `&sites=4|7` the sites the
// fixture answers with. Both are kept for the tab, so a reload or a link inside the app stays on them.
const KEY = 'trckable:menuproto'

export type MenuVariant = 'current' | 'a' | 'd' | 'e' | 'f' | 'g'
const VARIANTS: readonly string[] = ['current', 'a', 'd', 'e', 'f', 'g']

export function protoParams(): { menu: MenuVariant | null; sites: 4 | 7 } {
  const sp = new URLSearchParams(location.search)
  let menu = sp.get('menu')
  let sites = sp.get('sites')
  try {
    if (menu || sites) sessionStorage.setItem(KEY, `${menu ?? ''}:${sites ?? ''}`)
    else {
      const [m, s] = (sessionStorage.getItem(KEY) ?? ':').split(':')
      menu = m || null
      sites = s || null
    }
  } catch {
    /* only the reload forgets it */
  }
  return { menu: menu && VARIANTS.includes(menu) ? (menu as MenuVariant) : null, sites: sites === '7' ? 7 : 4 }
}
