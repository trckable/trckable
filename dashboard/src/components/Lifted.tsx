// A menu that is drawn when it opens, on the page's top layer (lib/topLayer.ts). The ref is the menu's own, for its keys.
import { useImperativeHandle, useRef, type ComponentProps, type Ref } from 'react'
import { useTopLayer } from '../lib/topLayer'

export function Lifted({ innerRef, ...p }: ComponentProps<'div'> & { innerRef?: Ref<HTMLDivElement> }) {
  const own = useRef<HTMLDivElement>(null)
  useTopLayer(own)
  useImperativeHandle(innerRef, () => own.current as HTMLDivElement)
  return <div {...p} ref={own} />
}
