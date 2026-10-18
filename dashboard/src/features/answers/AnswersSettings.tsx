// Settings → Answers: the questions asked once a week, the other sites to compare, where they are asked from, and what it costs.
import { useEffect, useState } from 'react'
import { toast } from '../../components/Toast'
import { isViewer } from '../../lib/me'
import type { Site } from '../../lib/api'
import { answersCopy as c } from './copy'
import { answersApi, type AnswersSettingsData } from './api'
import { SettingsQuestions, type Q } from './SettingsQuestions'
import { SettingsAsk, SettingsFoot, SettingsRivals } from './SettingsMore'
import './answers.css'

export default function AnswersSettings({ site }: { site: Site }) {
  const [data, setData] = useState<AnswersSettingsData | null>(null)
  const [list, setList] = useState<Q[]>([])
  const [rivals, setRivals] = useState<AnswersSettingsData['rivals']>([])
  const [saved, setSaved] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    answersApi.settings(site.id).then((d) => {
      setData(d)
      setList(d.questions)
      setRivals(d.rivals)
      setSaved(JSON.stringify([d.questions, d.rivals]))
    }, () => setData(null))
  }, [site.id])
  if (!data) return null
  const viewer = isViewer()
  const changed = JSON.stringify([list, rivals]) !== saved
  const save = () => {
    setBusy(true)
    setTimeout(() => {
      setBusy(false)
      setSaved(JSON.stringify([list, rivals]))
      toast(c.settings.saved)
    }, 700)
  }
  return (
    <section className="an an-settings">
      <h3>{c.settings.title}</h3>
      <p className="an-lead">{c.settings.lead}</p>
      <SettingsQuestions data={data} list={list} onList={setList} ownName={site.domain.replace(/^www\./, '').split('.')[0].toLowerCase()} viewer={viewer} />
      <SettingsRivals list={rivals} onList={setRivals} viewer={viewer} />
      <SettingsAsk data={data} site={site} viewer={viewer} />
      <SettingsFoot data={data} />
      {!viewer && (
        <div className="an-savebar">
          <button type="button" className="an-btn primary" disabled={!changed || busy} onClick={save}>
            {busy ? c.settings.saving : c.settings.save}
          </button>
        </div>
      )}
    </section>
  )
}
