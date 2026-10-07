// Settings → Modules: turn features on and off, and see exactly what each one
// costs. A module that is off ships no JavaScript, runs nothing and hides its
// views — so the list doubles as the weight budget.
import { Info } from '../components/Info'
import { DialogActions } from '../components/DialogActions'
import { DialogHead } from '../components/DialogHead'
import { Modal } from '../kit/Modal'
import { useEffect, useState } from 'react'
import { ModuleArt } from '../components/ModuleArt'
import { api, fail, type ModuleInfo, type ScriptInfo, type Site, more } from '../lib/apiMore'
import { words } from '../lib/errors'
import './Modules.css'
import { Loading } from '../components/loading/Loading'
import { canChange } from '../lib/me'
import { modulesChanged } from '../lib/useMods'

const bytes = (n: number) => (n >= 1024 ? `${(n / 1024).toFixed(2)} KB` : `${n} B`)

// What a module does with data: its own label, or whether it records any.
function DataTag({ m }: { m: ModuleInfo }) {
  if (m.label) return <span className="tag quiet">{m.label}</span>
  if (m.collects) return <span className="tag">records data</span>
  return <span className="tag quiet">reads data you already have</span>
}

export function ModulesSettings({ site }: { site: Site }) {
  const [mods, setMods] = useState<ModuleInfo[] | null>(null)
  const [script, setScript] = useState<ScriptInfo | null>(null)
  const [busy, setBusy] = useState('')
  const [confirm, setConfirm] = useState<ModuleInfo | null>(null)
  const [preview, setPreview] = useState<ModuleInfo | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const take = (d: { modules: ModuleInfo[]; script: ScriptInfo }) => {
    setMods(d.modules)
    setScript(d.script)
  }
  useEffect(() => {
    api.modules(site.id).then(take).catch((e: unknown) => setErr(words(e)))
  }, [site.id])

  const apply = (m: ModuleInfo, enabled: boolean) => {
    setBusy(m.id)
    setConfirm(null)
    more
      .setModule(site.id, m.id, enabled)
      .then((d) => {
        take(d)
        modulesChanged() // the dashboard behind reads them again
      })
      .catch((e: unknown) => fail(e))
      .finally(() => setBusy(''))
  }

  // Both directions ask first: turning something on has a cost, and turning it
  // off takes something away. Nobody should find that out afterwards.
  const toggle = (m: ModuleInfo) => setConfirm(m)

  return (
    <section className="card" style={{ gap: 16 }}>
      <div className="card-head">
        <h2>Modules</h2>
        {script && (
          <span className="size-strip">
            <b className="num">{bytes(script.bytes)}</b>
            <span className="faint num">core {bytes(script.core)} · all {bytes(script.full)}</span>
            <Info text="A module that is off sends no JavaScript and hides its views. Payments keep arriving while Revenue is off, so nothing is lost. Changes reach visitors within an hour." align="right" />
          </span>
        )}
      </div>
      {err && <div className="banner" role="alert">{err}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {mods?.map((m) => (
          <div key={m.id} className="module">
            <button type="button" className="mart-btn" onClick={() => setPreview(m)} aria-label={`What ${m.name} looks like`} title={`What ${m.name} looks like`}>
              <ModuleArt id={m.id} />
            </button>
            <div className="module-head">
                <strong>{m.name}</strong>
                <DataTag m={m} />
                {m.tracker_bytes ? <span className="tag quiet num">+{m.tracker_bytes} B in the browser</span> : null}
            </div>
            <div className="module-body">
              <p className="muted">{m.summary}</p>
              {m.server && <p className="faint small">While on: {m.server}.</p>}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={m.enabled}
              aria-label={`${m.name}: ${m.enabled ? 'on' : 'off'}`}
              className={'switch' + (m.enabled ? ' on' : '')}
              disabled={busy === m.id || !canChange()}
              onClick={() => toggle(m)}
            >
              <span />
            </button>
          </div>
        ))}
        {!mods && <Loading height={200} />}
      </div>

      {preview && (
        <Modal label={preview.name} onClose={() => setPreview(null)}>
          <div className="mart-hero">
            <ModuleArt id={preview.id} large />
          </div>
          <DialogHead heading={preview.name} hint={preview.summary} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <DataTag m={preview} />
            {preview.tracker_bytes ? <span className="tag quiet num">+{preview.tracker_bytes} B in the browser</span> : <span className="tag quiet">0 B in the browser</span>}
            {preview.server && <span className="tag quiet">{preview.server}</span>}
          </div>
          <DialogActions
            left={
              <button type="button" className="btn ghost" onClick={() => setPreview(null)}>
                Close
              </button>
            }
          >
            <button
              type="button"
              className={preview.enabled ? 'btn big' : 'btn primary big'}
              onClick={() => {
                const m = preview
                setPreview(null)
                setConfirm(m)
              }}
            >
              {preview.enabled ? 'Turn off' : 'Turn on'}
            </button>
          </DialogActions>
        </Modal>
      )}

      {confirm && (
        <Modal label={`${confirm.enabled ? 'Turn off' : 'Turn on'} ${confirm.name}`} className="wide" onClose={() => setConfirm(null)}>
          <div className="mart-hero">
            <ModuleArt id={confirm.id} large />
          </div>
          <DialogHead heading={`${confirm.enabled ? 'Turn off' : 'Turn on'} ${confirm.name}?`} />

          {!confirm.enabled && confirm.gives && (
            <ul className="bullets good">
              {confirm.gives.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          )}
          {!confirm.enabled && confirm.costs && (
            <>
              <span className="bullets-head">Worth knowing</span>
              <ul className="bullets">
                {confirm.costs.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </>
          )}

          {confirm.enabled && confirm.loses && (
            <ul className="bullets gone">
              {confirm.loses.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}
          {confirm.enabled && confirm.collects && (
            <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
              Turn it back on any time; the days in between stay empty.
            </p>
          )}

          <DialogActions
            left={
              <button type="button" className="btn ghost" onClick={() => setConfirm(null)}>
                {confirm.enabled ? 'Keep it on' : 'Not now'}
              </button>
            }
          >
            <button type="button" className={confirm.enabled ? 'btn danger big' : 'btn primary big'} onClick={() => apply(confirm, !confirm.enabled)}>
              {confirm.enabled ? 'Turn off' : 'Turn on'}
            </button>
          </DialogActions>
        </Modal>
      )}

      <span className="faint" style={{ fontSize: 12 }}>
        Installed with npm? Features are chosen when your app is built, so a change here reaches script-tag installs only until you rebuild.
      </span>
    </section>
  )
}
