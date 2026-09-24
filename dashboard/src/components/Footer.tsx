import { logoInner } from '../brand/logo'

/** The foot of every dashboard page: the full logo (the header has room for
    the ghost only), the year, this instance's version, and where to read more.
    Plain links, nothing loaded from anywhere. */
export function Footer({ version }: { version?: string }) {
  return (
    <footer className="app-footer">
      <a href="https://trckable.com" className="tkb-logo" aria-label="trckable" dangerouslySetInnerHTML={{ __html: logoInner() }} />
      <span>
        © {new Date().getFullYear()} trckable{version && <> · v{version}</>}
      </span>
      <span className="app-footer-links">
        <a href="https://trckable.com/docs/">Docs</a>
        <a href="https://trckable.com/docs/changelog/">Changelog</a>
      </span>
    </footer>
  )
}
