import * as React from "react"

/**
 * Documentation prose is written once and read on both sites; the frame around
 * it is not.
 *
 * The phone site renders the same doc page components inside its own screen —
 * its own header, its own back button, its own prev/next — so it switches the
 * desktop chrome off with this context. Anything a doc page renders that is
 * chrome rather than content should read `bare` and step aside.
 */
export interface DocChromeValue {
  bare: boolean
}

export const DocChromeContext = React.createContext<DocChromeValue>({ bare: false })

export function useDocChrome() {
  return React.useContext(DocChromeContext)
}
