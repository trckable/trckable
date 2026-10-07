// A card's name that is shorter on a phone: both are in the page, the stylesheet shows one
// (base.css), and the full one stays for screen readers.
export function ShortName({ full, short }: { full: string; short: string }) {
  return (
    <>
      <span className="nm-full">{full}</span>
      <span className="nm-short" aria-hidden="true">
        {short}
      </span>
    </>
  )
}
