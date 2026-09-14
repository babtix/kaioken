import * as React from "react"

/**
 * Lets a detail screen name itself in the top bar.
 *
 * A phone bar has room for one line, and on a document that line should say
 * which document — not "kaioken", which the visitor can already see they are
 * on. Screens call useScreenTitle(); the bar reads it and grows a back button.
 */
interface ChromeValue {
  title: string | null
  setTitle: (title: string | null) => void
}

const ChromeContext = React.createContext<ChromeValue>({
  title: null,
  setTitle: () => {},
})

export function ChromeProvider({ children }: { children: React.ReactNode }) {
  const [title, setTitle] = React.useState<string | null>(null)
  const value = React.useMemo(() => ({ title, setTitle }), [title])
  return <ChromeContext.Provider value={value}>{children}</ChromeContext.Provider>
}

/** Publish this screen's title while it is mounted. */
export function useScreenTitle(title: string | null) {
  const { setTitle } = React.useContext(ChromeContext)
  React.useEffect(() => {
    setTitle(title)
    return () => setTitle(null)
  }, [title, setTitle])
}

export function useChromeTitle() {
  return React.useContext(ChromeContext).title
}

/** Where a detail screen's back button goes. */
export function parentPath(pathname: string): string | null {
  if (/^\/docs\/.+/.test(pathname)) return "/docs"
  if (/^\/preview\/.+/.test(pathname)) return "/preview"
  return null
}
