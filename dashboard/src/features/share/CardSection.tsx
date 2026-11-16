// What to share: the gallery. Pictures in groups by topic, each a small live thumbnail (drawn when it scrolls into
// view) and its name; a picture the site cannot make yet is not shown.
import { useEffect, useRef, useState, type CSSProperties } from 'react'
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
      {seen && <img src={cardUrl(site, { ...look, template: id, shape: 'link' }, 'thumb')} alt="" loading="lazy" decoding="async" />}
    </span>
  )
}

export function CardSection({ site, look, has, pictures = PICTURES, onChange }: Props) {
  return (
    <div className="sd-gallery" role="radiogroup" aria-label={copy.templates} style={{ '--ring': look.accent } as CSSProperties}>
      {TOPICS.map((topic) => {
        const list = pictures.filter((p) => p.topic === topic && !missing(p, has))
        if (!list.length) return null
        return (
          <div key={topic} className="sd-topic">
            <h3>{copy.topics[topic]}</h3>
            <div className="sd-pics">
              {list.map((p) => (
                <button key={p.id} type="button" role="radio" aria-checked={look.template === p.id} className="sd-pic" title={copy.template[p.id].hint} onClick={() => onChange(p.id)}>
                  <Thumb site={site} look={look} id={p.id} />
                  <b>{copy.template[p.id].name}</b>
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
