// Settings → Answers: the questions asked once a week, the other sites to compare, where they are asked from, and what it costs.
import { useEffect, useState } from 'react'
import { toast } from '../../components/Toast'
import { messageOf } from '../../lib/api'
import { can } from '../../lib/permissions'
import type { Site } from '../../lib/api'
import { answersCopy as c } from './copy'
import { answersApi, type AnswersSetup, type Competitor, type Suggestions } from './api'
import { countryOfZone } from './country'
import { SettingsQuestions, type Q } from './SettingsQuestions'
import { SettingsAsk, SettingsFoot, SettingsRivals } from './SettingsMore'
import './answers.css'

const asQ = (qs: AnswersSetup['questions']): Q[] => (qs ?? []).map((q) => ({ id: q.id, key: `q${q.id}`, text: q.text, active: q.active }))
const plain = (l: Q[]) => l.map((q) => [q.id ?? null, q.text, q.active])

export default function AnswersSettings({ site }: { site: Site }) {
  const viewer = !can('answers.manage')
  const [setup, setSetup] = useState<AnswersSetup | null | undefined>(undefined)
  const [sug, setSug] = useState<Suggestions>({ questions: [], competitors: [] })
  const [list, setList] = useState<Q[]>([])
  const [rivals, setRivals] = useState<Competitor[]>([])
  const [country, setCountry] = useState('')
  const [base, setBase] = useState('')
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState('')
  const state = (q: Q[], r: Competitor[], k: string) => JSON.stringify([plain(q), r, k])
  useEffect(() => {
    answersApi.setup(site.id).then(
      (d) => {
        const q = asQ(d.questions)
        const k = d.country || countryOfZone(site.timezone)
        setSetup(d)
        setList(q)
        setRivals(d.competitors ?? [])
        setCountry(k)
        // A country the site has not chosen is offered from its time zone: saving confirms it.
        setBase(state(q, d.competitors ?? [], d.country ?? ''))
      },
      () => setSetup(null),
    )
    if (!viewer) void answersApi.suggestions(site.id).then(setSug, () => undefined)
  }, [site.id]) // eslint-disable-line react-hooks/exhaustive-deps -- loaded once per site
  if (setup === undefined) return null
  if (setup === null) return <p className="an-warn">{c.settings.failed}</p>
  if (setup.engines.length === 0) return <p className="an-help">{c.settings.noEngine}</p>
  const changed = state(list, rivals, country) !== base
  const save = async () => {
    setBusy(true)
    setSaid('')
    try {
      const first = JSON.parse(base) as [unknown, Competitor[], string]
      if (JSON.stringify(plain(list)) !== JSON.stringify(first[0])) {
        const got = await answersApi.saveQuestions(site.id, list.map((q) => ({ id: q.id, text: q.text.trim(), active: q.active })))
        setList(asQ(got.questions))
      }
      if (JSON.stringify(rivals) !== JSON.stringify(first[1])) setRivals((await answersApi.saveCompetitors(site.id, rivals.filter((r) => r.name.trim() || r.domain.trim()))).competitors)
      if (country !== first[2]) await answersApi.saveCountry(site.id, country)
      const fresh = await answersApi.setup(site.id)
      setSetup(fresh)
      setList(asQ(fresh.questions))
      setRivals(fresh.competitors ?? [])
      setCountry(fresh.country ?? '')
      setBase(state(asQ(fresh.questions), fresh.competitors ?? [], fresh.country ?? ''))
      toast(c.settings.saved)
    } catch (e) {
      setSaid(messageOf(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="an an-settings">
      <h3>{c.settings.title}</h3>
      <p className="an-lead">{c.settings.lead}</p>
      <SettingsQuestions list={list} onList={setList} max={setup.max ?? 10} words={setup.words ?? []} suggestions={sug.questions} viewer={viewer} />
      <SettingsRivals list={rivals} onList={setRivals} max={setup.max_competitors ?? 5} suggested={sug.competitors} viewer={viewer} />
      <SettingsAsk setup={setup} site={site} country={country} onCountry={setCountry} viewer={viewer} />
      <SettingsFoot setup={setup} />
      {!viewer && (
        <div className="an-savebar">
          <button type="button" className="an-btn primary" disabled={!changed || busy} onClick={() => void save()}>
            {busy ? c.settings.saving : c.settings.save}
          </button>
          {said && <p className="an-warn">{said}</p>}
        </div>
      )}
    </section>
  )
}
