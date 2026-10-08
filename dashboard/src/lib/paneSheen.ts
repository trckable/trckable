// The light that follows the pointer over a menu row: sets --x and --y on the row
// under it, which the menus' hover reads. One listener for every menu, started
// by importing this file.
document.addEventListener(
  'pointermove',
  (e) => {
    const row = (e.target as Element | null)?.closest?.<HTMLElement>('.pop :is(.site, .menu-row, .lrow, .pop-row, .pop-role, button)')
    if (!row) return
    const at = row.getBoundingClientRect()
    row.style.setProperty('--x', `${e.clientX - at.left}px`)
    row.style.setProperty('--y', `${e.clientY - at.top}px`)
  },
  { passive: true },
)
