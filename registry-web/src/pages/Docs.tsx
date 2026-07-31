import { Link, Navigate, useParams } from "react-router-dom"
import { Markdown } from "../components/Markdown"
import developerGuide from "../../content/developer-guide.md?raw"
import packagingPublishing from "../../content/packaging-publishing.md?raw"
import submitting from "../../content/submitting.md?raw"
import userGuide from "../../content/user-guide.md?raw"

// Docs ship inside the site bundle (markdown via ?raw), so the docs section
// works offline-of-GitHub and versions together with the code it documents.
const DOCS = [
  { slug: "developer-guide", title: "Developer guide", body: developerGuide },
  { slug: "packaging-publishing", title: "Packaging & publishing", body: packagingPublishing },
  { slug: "submitting", title: "Submitting to the registry", body: submitting },
  { slug: "user-guide", title: "User guide", body: userGuide },
] as const

export default function Docs() {
  const { slug } = useParams()
  const doc = DOCS.find((d) => d.slug === slug)
  if (!doc) return <Navigate to={`/docs/${DOCS[0].slug}`} replace />

  return (
    <div className="animate-rise grid gap-8 lg:grid-cols-[220px_1fr]">
      <nav className="lg:sticky lg:top-20 lg:self-start">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-kai-dim">documentation</p>
        <ul className="flex flex-col gap-1">
          {DOCS.map((d) => (
            <li key={d.slug}>
              <Link
                to={`/docs/${d.slug}`}
                className={`block rounded-sm px-2 py-1.5 font-mono text-xs transition-colors ${
                  d.slug === doc.slug
                    ? "text-kai-amber"
                    : "text-kai-muted hover:bg-kai-panel hover:text-kai-text"
                }`}
              >
                <span className={`mr-0.5 ${d.slug === doc.slug ? "text-kai-orange" : "text-transparent"}`}>/</span>
                {d.title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 max-w-3xl">
        <Markdown>{doc.body}</Markdown>
      </div>
    </div>
  )
}
