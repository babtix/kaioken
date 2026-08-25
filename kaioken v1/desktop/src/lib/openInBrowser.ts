import { useBrowserStore } from "@/store/browser"

/**
 * Open a URL in the in-app Browser tab. Works both inside and outside React
 * components by accessing the zustand store directly.
 *
 * This replaces all `openUrl()` / `invoke("open_external")` calls throughout
 * the app so that links open in the embedded browser pane, not the OS browser.
 *
 * Navigation to the /browser route is handled via hash-based location change,
 * which works with HashRouter without needing a React router ref.
 */
export function openInBrowser(url: string): void {
  const store = useBrowserStore.getState()

  // If the active tab is a new-tab page, navigate it instead of spawning one.
  const active = store.tabs.find((t) => t.id === store.activeId)
  if (active && active.stack[active.index] === "about:newtab") {
    store.navigate(url)
  } else {
    store.newTab(url)
  }

  // Switch to the Browser route. HashRouter uses the hash portion of the URL,
  // so setting location.hash is the simplest way to navigate programmatically
  // from outside a React component. React Router picks up the change.
  if (!window.location.hash.startsWith("#/browser")) {
    window.location.hash = "#/browser"
  }
}
