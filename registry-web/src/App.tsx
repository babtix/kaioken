import { BrowserRouter, Link, NavLink, Route, Routes, useLocation } from "react-router-dom"
import PageBackground from "./components/PageBackground"
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

// Inside the router so the backdrop can follow the route: the home shopfront
// gets the full show (grid, blooms, scanlines), reading surfaces get the
// quiet variant — the same split the main site makes.
function Shell() {
  const { pathname } = useLocation()

  return (
    /* no bg utility here — the fixed -z-10 backdrop must show through */
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4">
      <PageBackground variant={pathname === "/" ? "full" : "simple"} />

      <header className="sticky top-0 z-10 -mx-4 border-b border-kai-line/60 bg-kai-black/85 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-4">
          <Link to="/" className="group font-mono text-sm font-bold tracking-tight text-kai-white">
            <span className="text-kai-orange transition-colors group-hover:text-kai-amber">kaioken</span>
            <span className="text-kai-dim"> ▎ </span>
            <span className="text-kai-text">extensions</span>
          </Link>
          <nav className="flex items-center gap-1">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `rounded-sm px-2.5 py-1 font-mono text-xs transition-colors ${
                    isActive ? "text-kai-amber" : "text-kai-muted hover:text-kai-text"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={`mr-0.5 ${isActive ? "text-kai-orange" : "text-transparent"}`}>/</span>
                    {n.label}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
          <a
            href="https://github.com/babtix/kaioken"
            target="_blank"
            rel="noreferrer"
            className="ml-auto rounded-sm px-2 py-1 font-mono text-xs text-kai-muted transition-colors hover:text-kai-text"
          >
            github <span className="text-[10px] text-kai-dim">↗</span>
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
          className="text-kai-blue underline decoration-kai-blue/40 underline-offset-2 transition-colors hover:text-kai-amber"
        >
          kaioken-extensions
        </a>
        .
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  )
}
