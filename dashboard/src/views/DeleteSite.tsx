// Removing a site: what goes with it, then its name typed (or pasted from the badge) to confirm.
import { Check, Copy, TriangleAlert } from 'lucide-react'
import { HoldButton } from '../components/HoldButton'
import { Field } from '../components/Field'
import { Info } from '../components/Info'
import { Modal, type Frame } from '../kit/Modal'
import { ModalMark } from '../kit/ModalMark'
import { type MouseEvent, useEffect, useState } from 'react'
import { fail, type Site, more } from '../lib/apiMore'
import { fmtInt } from '../lib/format'
import { navigate } from '../lib/url'
import './Sites.css'

/** The delete field's label, around the site's name. */
const CONFIRM = ['Type', 'to continue'] as const

/**
 * Deleting a site throws away everything recorded for it, so it asks for the
 * domain first and then shows the work: what is being cleared, and what was
 * removed when it is done. A long silence is the worst thing a delete can do.
 */
export function DeleteSite({ site, onClose, onSites }: { site: Site; onClose: () => void; onSites: () => void }) {
  const [typed, setTyped] = useState('')
  const [step, setStep] = useState<'what' | 'last' | 'working' | 'done'>('what')
  const [counts, setCounts] = useState<Record<string, number> | null>(null)
  const [gone, setGone] = useState<{ events: number; sessions: number; payments: number } | null>(null)
  useEffect(() => {
    more.deletePreview(site.id).then(setCounts).catch(() => setCounts({}))
  }, [site.id])
  const named = typed.trim().toLowerCase() === site.domain.toLowerCase()

  const run = () => {
    setStep('working')
    // At least a moment on screen: a small site goes in milliseconds, and a
    // flash of the working step read as a glitch.
    const shown = new Promise((r) => setTimeout(r, 1200))
    more
      .deleteSite(site.id, typed.trim())
      .then(async (r) => {
        await shown
        // The summary first: refreshing the list now would take the page
        // (and this dialog) away before it is read.
        setGone(r)
        setStep('done')
      })
      .catch((e: unknown) => {
        fail(e, run)
        setStep('last')
      })
  }

  // What goes, in numbers, before anyone decides.
  const lines: [string, number | undefined][] = [
    ['events', counts?.events],
    ['visits', counts?.sessions],
    ['payments', counts?.payments],
    ['payment connections', counts?.connections],
    ['share links', counts?.shares],
    ['widgets', counts?.widgets],
  ]

  const frame = (): Frame => {
    if (step === 'what') return {
          title: `Delete ${site.domain}?`,
          subtitle: 'Removes the site and all its data. There is no undo.',
          icon: <ModalMark icon={TriangleAlert} danger />,
          size: 'md',
          cancel: 'Keep it',
          actions: (
            <button type="button" className="btn danger big" disabled={!named} onClick={() => setStep('last')}>
              Continue
            </button>
          ),
        }
    if (step === 'last') return {
            title: 'Last check',
            subtitle: `Hold the button and ${site.domain} is gone for good.`,
            help: 'Nobody, including trckable, can bring it back from here.',
            icon: <ModalMark icon={TriangleAlert} danger />,
            size: 'md',
            cancel: false,
            extra: (
              <button type="button" className="btn ghost" onClick={() => setStep('what')}>
                Back
              </button>
            ),
            actions: <HoldButton onDone={run}>Hold to delete forever</HoldButton>,
          }
    if (step === 'working') return { title: `Deleting ${site.domain}`, size: 'md', cancel: false }
    return {
              title: `${site.domain} is gone`,
              size: 'md',
              cancel: false,
              actions: (
                <button type="button" className="btn primary big" onClick={() => { onClose(); onSites(); navigate('/') }}>
                  Done
                </button>
              ),
            }
  }

  return (
    <Modal label={`Delete ${site.domain}`} className="danger-modal" over keepSize={false} onClose={step === 'what' || step === 'last' ? onClose : undefined} frame={frame()}>
      {step === 'what' && (
        <>
          <div className="danger-list danger-step">
            <b className="danger-what">
              What goes
              <Info text="Backups made before now still hold it until they age out. Payment providers keep the webhooks they were given; remove those there." />
            </b>
            <ul>
              {lines.map(([label, n]) => (
                <li key={label}>
                  <span className="num">{n === undefined ? '…' : fmtInt(n)}</span> {label}
                </li>
              ))}
              <li>Its settings, modules, verification and look</li>
            </ul>
          </div>
          <div className="danger-type">
            <Field label={<>{CONFIRM[0]} <NameBadge name={site.domain} /> {CONFIRM[1]}</>}>
              {(f) => (
                <input
                  {...f}
                  className="input"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={site.domain}
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && named && setStep('last')}
                />
              )}
            </Field>
          </div>
        </>
      )}

      {step === 'last' && (
        <>
          <div className="danger-list danger-final danger-step">
            <span>
              <b className="num">{fmtInt(counts?.events ?? 0)}</b> events
            </span>
            <span>
              <b className="num">{fmtInt(counts?.sessions ?? 0)}</b> visits
            </span>
            <span>
              <b className="num">{fmtInt(counts?.payments ?? 0)}</b> payments
            </span>
          </div>
        </>
      )}

      {step === 'working' && (
        <div className="danger-working danger-step" key="working" role="status" aria-live="polite">
          <div className="shred" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
          <span className="shred-bar" aria-hidden="true">
            <span />
          </span>
          <span className="faint">This can take a moment. Keep this open.</span>
        </div>
      )}

      {step === 'done' && (
        <>
          <div className="wiz-done danger-done danger-step" key="done">
            <Check size={34} strokeWidth={2} aria-hidden="true" />
          </div>
          {gone && (
            <ul className="bullets">
              <li>
                {fmtInt(gone.events)} events and {fmtInt(gone.sessions)} visits removed
              </li>
              {gone.payments > 0 && <li>{fmtInt(gone.payments)} payments removed</li>}
              <li>Settings, modules, share links and widgets removed</li>
            </ul>
          )}
        </>
      )}
    </Modal>
  )
}

/** The name to type, as a badge with a copy button: the same as typing it, for whoever would rather paste. */
function NameBadge({ name }: { name: string }) {
  const [copied, setCopied] = useState(false)
  const copy = (e: MouseEvent) => {
    e.preventDefault() // inside the field's label: copying should not move the focus
    void navigator.clipboard?.writeText(name).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    })
  }
  return (
    <span className="name-badge">
      <code>{name}</code>
      <button type="button" onClick={copy} aria-label={copied ? 'Copied' : `Copy ${name}`} title={copied ? 'Copied' : 'Copy'}>
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </span>
  )
}
