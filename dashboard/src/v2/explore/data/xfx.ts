// Development only: a sample world asked for in the address (?xfx=full) is written down at the first load, because the
// page rewrites its address as it goes. In a build the check is false and this file is empty.
export const XFX = 'trckable:xfx'
export const XFH = 'trckable:xfh'

if (import.meta.env.DEV) {
  try {
    const q = new URLSearchParams(location.search).get('xfx')
    if (q !== null) sessionStorage.setItem(XFX, q)
    sessionStorage.setItem(XFH, new URLSearchParams(location.search).has('xfh') ? '1' : '')
  } catch {
    /* a blocked store only forgets */
  }
}
