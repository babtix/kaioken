import { useCallback, useEffect, useState } from "react"
import { api, formatDate, type Post } from "./api"
import Admin from "./Admin"
import Markdown from "./Markdown"

// Routing is by pathname without a router dependency: this site has two
// screens. vercel.json rewrites every non-API path to index.html, so deep
// links land here and are resolved below.
type Route = { name: "feed" } | { name: "post"; id: string } | { name: "admin" }

function routeFrom(pathname: string): Route {
  if (pathname === "/admin") return { name: "admin" }
  const m = /^\/post\/(.+)$/.exec(pathname)
  if (m) return { name: "post", id: decodeURIComponent(m[1]) }
  return { name: "feed" }
}

export function navigate(to: string) {
  window.history.pushState({}, "", to)
  window.dispatchEvent(new PopStateEvent("popstate"))
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => routeFrom(window.location.pathname))

  useEffect(() => {
    const onPop = () => setRoute(routeFrom(window.location.pathname))
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  return (
    <>
      <header className="site">
        <div className="wrap">
          <a className="brand" href="/" onClick={link("/")}>
            <span className="mark">⚡</span>
            kaioken
            <span className="sub">news</span>
          </a>
          <span className="spacer" />
          <a className="nav-link" href="https://kaioken.vercel.app" target="_blank" rel="noreferrer">
            main site<span className="ext">↗</span>
          </a>
          <a className="nav-link" href="https://github.com/babtix/kaioken" target="_blank" rel="noreferrer">
            GitHub<span className="ext">↗</span>
          </a>
          <a className="nav-link" href="/admin" onClick={link("/admin")}>
            Admin
          </a>
        </div>
      </header>

      <main className="wrap">
        {route.name === "feed" && <Feed />}
        {route.name === "post" && <PostPage id={route.id} />}
        {route.name === "admin" && <Admin />}
      </main>

      <footer className="site">
        <div className="wrap">
          <span>
            <span className="ps1">$</span> built for terminals · MIT
          </span>
          <span className="spacer" />
          <a href="https://kaioken.vercel.app" target="_blank" rel="noreferrer">
            kaioken.vercel.app
          </a>
          <a href="https://github.com/babtix/kaioken" target="_blank" rel="noreferrer">
            github.com/babtix/kaioken
          </a>
        </div>
      </footer>
    </>
  )
}

/** Intercepts a same-site link so it routes without a full page load. */
function link(to: string) {
  return (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    navigate(to)
  }
}

function Feed() {
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    api
      .list()
      .then((r) => setPosts(r.posts))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  useEffect(load, [load])

  return (
    <>
      <section className="hero">
        <div className="prompt">
          <span className="ps1">$</span> <span className="cmd">tail -f kaioken/news</span>
          <span className="cursor" aria-hidden />
        </div>
        <h1>
          Project <span className="accent">news</span>
        </h1>
        <p>Releases, design notes and what's changing in Kaioken.</p>
      </section>

      {error && <p className="error">{error}</p>}
      {!posts && !error && <p className="muted">Loading…</p>}
      {posts?.length === 0 && (
        <div className="notice" style={{ marginTop: 24 }}>
          Nothing published yet. Sign in at <a href="/admin" onClick={link("/admin")}>/admin</a> to
          write the first post.
        </div>
      )}

      <div className="feed">
        {posts?.map((p, i) => (
          <article className="post" key={p.id}>
            <h2>
              <a href={`/post/${p.id}`} onClick={link(`/post/${p.id}`)}>
                {p.title}
              </a>
            </h2>
            <div className="meta">
              <span className="idx">#{String(posts.length - i).padStart(2, "0")}</span>
              <span>{formatDate(p.created)}</span>
              {!p.published && <span className="badge-draft">draft</span>}
              {p.tags.map((t) => (
                <span className="tag" key={t}>
                  {t}
                </span>
              ))}
            </div>
            {p.summary && <p className="summary">{p.summary}</p>}
            <div className="more">read →</div>
          </article>
        ))}
      </div>
    </>
  )
}

function PostPage({ id }: { id: string }) {
  const [post, setPost] = useState<Post | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get(id)
      .then((r) => setPost(r.post))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [id])

  if (error) return <p className="error">{error}</p>
  if (!post) return <p className="muted">Loading…</p>

  return (
    <article className="article">
      <a className="back" href="/" onClick={link("/")}>
        ← All news
      </a>
      <h1>{post.title}</h1>
      <div className="meta">
        <span>{formatDate(post.created)}</span>
        {!post.published && <span className="badge-draft">draft</span>}
        {post.tags.map((t) => (
          <span className="tag" key={t}>
            {t}
          </span>
        ))}
      </div>
      {post.summary && <p className="summary">{post.summary}</p>}
      <div className="body">
        <Markdown>{post.body}</Markdown>
      </div>
    </article>
  )
}
