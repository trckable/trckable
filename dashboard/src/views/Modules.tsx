// Settings → Modules: turn features on and off, and see exactly what each one
// costs. A module that is off ships no JavaScript, runs nothing and hides its
// views — so the list doubles as the weight budget.
import { Info } from '../components/Info'
import { DialogActions } from '../components/DialogActions'
import { Modal } from '../components/Modal'
import { useEffect, useState } from 'react'
import { ModuleArt } from '../components/ModuleArt'
import { api, type ModuleInfo, type ScriptInfo, type Site } from '../lib/api'
import './Modules.css'

const bytes = (n: number) => (n >= 1024 ? (n / 1024).toFixed(2) + ' KB' : n + ' B')

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
    api.modules(site.id).then(take).catch((e: Error) => setErr(e.message))
  }, [site.id])

  const apply = (m: ModuleInfo, enabled: boolean) => {
    setBusy(m.id)
    setConfirm(null)
    api
      .setModule(site.id, m.id, enabled)
      .then(take)
      .catch((e: Error) => setErr(e.message))
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
                {m.label ? (
                  <span className="tag quiet">{m.label}</span>
                ) : m.collects ? (
                  <span className="tag">records data</span>
                ) : (
                  <span className="tag quiet">reads data you already have</span>
                )}
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
              disabled={busy === m.id}
              onClick={() => toggle(m)}
            >
              <span />
            </button>
          </div>
        ))}
        {!mods && [0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 64 }} />)}
      </div>

      {preview && (
        <Modal label={preview.name} onClose={() => setPreview(null)}>
          <div className="mart-hero">
            <ModuleArt id={preview.id} large />
          </div>
          <h2>{preview.name}</h2>
          <p className="muted" style={{ margin: 0 }}>
            {preview.summary}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {preview.label ? (
              <span className="tag quiet">{preview.label}</span>
            ) : preview.collects ? (
              <span className="tag">records data</span>
            ) : (
              <span className="tag quiet">reads data you already have</span>
            )}
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
          <h2>
            {confirm.enabled ? 'Turn off' : 'Turn on'} {confirm.name}?
          </h2>

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
              You can turn it back on whenever you like, but the days in between will have no data.
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
