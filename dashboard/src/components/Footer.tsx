import { logoInner } from '../brand/logo'

/** The foot of every dashboard page: the full logo, the year, this instance's
    version (and the newer one, when there is one), and where to read more. */
export function Footer({ version, newer, onNewer }: { version?: string; newer?: string; onNewer?: () => void }) {
  return (
    <footer className="app-footer">
      <a href="https://trckable.com" className="tkb-logo" aria-label="trckable" dangerouslySetInnerHTML={{ __html: logoInner() }} />
      <span>
        © {new Date().getFullYear()} trckable{version && <> · v{version}</>}
        {newer && (
          <>
            {' · '}
            <button type="button" className="footer-newer" onClick={onNewer}>
              v{newer} is out
            </button>
          </>
        )}
      </span>
      <span className="app-footer-links">
        <a href="https://trckable.com/docs/">Docs</a>
        <a href="https://trckable.com/docs/changelog/">Changelog</a>
      </span>
    </footer>
  )
}
