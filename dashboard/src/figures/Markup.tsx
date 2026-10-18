import { useEffect, useRef } from 'react'

/** A figure's drawing: constant markup written in this module, never user input.
    `attach` gives it its reactions to the pointer and returns how to take them off. */
export function Markup({ html, attach }: { html: string; attach?: (svg: SVGSVGElement) => () => void }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const svg = box.current?.querySelector('svg')
    return svg && attach ? attach(svg) : undefined
  }, [html, attach])
  return <div ref={box} dangerouslySetInnerHTML={{ __html: html }} />
}
