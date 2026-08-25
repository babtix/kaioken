// The registry website's public pages, as data. Every desktop surface that
// links out to the web (nav rail, command palette, Extensions screen) renders
// from this one list, so a new page — or the eventual custom domain — is a
// one-file change. Pure data on purpose: no plugin import, so it stays
// unit-testable under node.

export const REGISTRY_WEB_URL = "https://kaioken-registry-web.vercel.app"

export type RegistryLink = {
  label: string
  url: string
  /** One line shown as tooltip / palette subtitle. */
  description: string
}

export const REGISTRY_LINKS: RegistryLink[] = [
  {
    label: "Registry home",
    url: `${REGISTRY_WEB_URL}/`,
    description: "The extension registry website — start here",
  },
  {
    label: "Browse extensions",
    url: `${REGISTRY_WEB_URL}/browse`,
    description: "Search the community catalog with trust details",
  },
  {
    label: "Submit an extension",
    url: `${REGISTRY_WEB_URL}/submit`,
    description: "Validate your repo and prep the listing PR",
  },
  {
    label: "Developer guide",
    url: `${REGISTRY_WEB_URL}/docs/developer-guide`,
    description: "Manifest reference, all three tiers, the dev loop",
  },
  {
    label: "Packaging & publishing",
    url: `${REGISTRY_WEB_URL}/docs/packaging-publishing`,
    description: "Versioning, releases, how installs and updates work",
  },
  {
    label: "Submitting to the registry",
    url: `${REGISTRY_WEB_URL}/docs/submitting`,
    description: "Entry format, CI checks, review criteria",
  },
  {
    label: "User guide",
    url: `${REGISTRY_WEB_URL}/docs/user-guide`,
    description: "Discovering, installing, the trust model, managing",
  },
  {
    label: "Community index (GitHub)",
    url: "https://github.com/babtix/kaioken-extensions",
    description: "The reviewed JSON index every Kaioken client fetches",
  },
  {
    label: "Extension template (GitHub)",
    url: "https://github.com/babtix/kaioken-extension-template",
    description: "Starting point for building your own extension",
  },
]
