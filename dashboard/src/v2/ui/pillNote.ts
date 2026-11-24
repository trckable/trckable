import { createContext, type ReactNode } from 'react'

/** A small muted line under the date on the period pill (Explore: when the numbers were read); none where nothing provides one. */
export const PillNote = createContext<ReactNode>(null)
