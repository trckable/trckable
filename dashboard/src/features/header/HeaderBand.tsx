// The header's band: both rows on one surface of their own, stuck to the top.
// Its shadow shows only once the page has scrolled under it.
import { useEffect, useState, type ReactNode } from 'react'

export function HeaderBand({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 0)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  return (
    <div className="hdr-band" data-scrolled={scrolled || undefined}>
      {children}
    </div>
  )
}
