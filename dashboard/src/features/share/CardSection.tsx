// What to share: the gallery. Pictures in groups by topic, each a live thumbnail (drawn when it scrolls into view); a
// picture the site cannot make yet is disabled, with one line saying why.
import { MessageSquareText } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { PICTURES, TOPICS, cardUrl, missing, type Look, type Need, type Picture, type Template } from './card'
import { copy } from './copy'

type Props = { site: string; look: Look; has: Record<Need, boolean>; pictures?: Picture[]; onChange: (t: Template) => void }

/** The thumbnail is asked for only once it is on screen (at once where the browser cannot tell). */
function useSeen() {
  const ref = useRef<HTMLSpanElement>(null)
  const [seen, setSeen] = useState(typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    const el = ref.current
    if (seen || !el) return
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setSeen(true), { rootMargin: '80px' })
    io.observe(el)
    return () => io.disconnect()
  }, [seen])
  return { ref, seen }
}

function Thumb({ site, look, id }: { site: string; look: Look; id: Template }) {
  const { ref, seen } = useSeen()
  return (
    <span ref={ref} className="sd-thumb">
      {id === 'post' ? <MessageSquareText size={22} strokeWidth={1.6} aria-hidden="true" /> : seen && <img src={cardUrl(site, { ...look, template: id, shape: 'link' })} alt="" loading="lazy" decoding="async" />}
    </span>
  )
}

export function CardSection({ site, look, has, pictures = PICTURES, onChange }: Props) {
  return (
    <div className="sd-gallery" role="radiogroup" aria-label={copy.templates}>
      {TOPICS.map((topic) => {
        const list = pictures.filter((p) => p.topic === topic)
        if (!list.length) return null
        return (
          <div key={topic} className="sd-topic">
            <h3>{copy.topics[topic]}</h3>
            <div className="sd-pics">
              {list.map((p) => {
                const lacks = missing(p, has)
                return (
                  <button key={p.id} type="button" role="radio" aria-checked={look.template === p.id} disabled={!!lacks} className="sd-pic" title={lacks ? copy.why[lacks] : copy.template[p.id].hint} onClick={() => onChange(p.id)}>
                    <Thumb site={site} look={look} id={p.id} />
                    <b>{copy.template[p.id].name}</b>
                    {lacks && <small>{copy.why[lacks]}</small>}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
