import { BrowserRouter, Link, NavLink, Route, Routes } from "react-router-dom"
import Browse from "./pages/Browse"
import Detail from "./pages/Detail"
import Docs from "./pages/Docs"
import Home from "./pages/Home"
import Submit from "./pages/Submit"

const NAV = [
  { to: "/browse", label: "browse", end: false },
  { to: "/submit", label: "submit", end: false },
  { to: "/docs", label: "docs", end: false },
] as const

export default function App() {
  return (
    <BrowserRouter>
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4">
        <header className="sticky top-0 z-10 -mx-4 border-b border-kai-line bg-kai-black/90 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-6">
            <Link to="/" className="font-mono text-sm font-bold tracking-wide text-kai-orange">
              KAIOKEN<span className="text-kai-dim"> // </span>
              <span className="text-kai-text">extensions</span>
            </Link>
            <nav className="flex items-center gap-1">
              {NAV.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) =>
                    `rounded px-2 py-1 font-mono text-xs transition-colors ${
                      isActive ? "bg-kai-orange/10 text-kai-orange" : "text-kai-muted hover:text-kai-text"
                    }`
                  }
                >
                  /{n.label}
                </NavLink>
              ))}
            </nav>
            <a
              href="https://github.com/babtix/kaioken"
              target="_blank"
              rel="noreferrer"
              className="ml-auto font-mono text-xs text-kai-muted hover:text-kai-text"
            >
              github ↗
            </a>
          </div>
        </header>

        <main className="flex-1 py-8">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/browse" element={<Browse />} />
            <Route path="/ext/:id" element={<Detail />} />
            <Route path="/submit" element={<Submit />} />
            <Route path="/docs" element={<Docs />} />
            <Route path="/docs/:slug" element={<Docs />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </main>

        <footer className="border-t border-kai-line py-4 font-mono text-[11px] text-kai-dim">
          The registry stores pointers, never code — extensions install from their authors' GitHub
          releases, and executable extensions stay inert until you explicitly trust that exact
          version. Listings are reviewed pull requests to{" "}
          <a
            href="https://github.com/babtix/kaioken-extensions"
            target="_blank"
            rel="noreferrer"
            className="text-kai-blue underline"
          >
            kaioken-extensions
          </a>
          .
        </footer>
      </div>
    </BrowserRouter>
  )
}
