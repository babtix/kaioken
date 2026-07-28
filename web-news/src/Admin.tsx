import { useCallback, useEffect, useState } from "react"
import { api, formatDate, type Post } from "./api"

// Admin is the whole authoring surface: sign in, list every post including
// drafts, and edit one in place. It is a single screen because the site has a
// single author with a single job — write news.
export default function Admin() {
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    api
      .session()
      .then((r) => setAuthed(r.authed))
      .catch(() => setAuthed(false))
  }, [])

  if (authed === null) return <p className="muted" style={{ paddingTop: 40 }}>Checking session…</p>
  if (!authed) return <SignIn onDone={() => setAuthed(true)} />
  return <Console onSignOut={() => setAuthed(false)} />
}

function SignIn({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password || busy) return
    setBusy(true)
    setError(null)
    try {
      await api.login(password)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
      setPassword("")
    }
  }

  return (
    <div className="center">
      <form className="card" onSubmit={submit}>
        <h1 style={{ margin: 0, fontSize: 16, color: "var(--white)" }}>Sign in</h1>
        <p className="muted" style={{ marginTop: 6 }}>Admin access for posting news.</p>
        <label htmlFor="pw">Password</label>
        <input
          id="pw"
          type="password"
          value={password}
          autoFocus
          autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="error">{error}</p>}
        <button className="primary" type="submit" disabled={busy || !password} style={{ marginTop: 16, width: "100%" }}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  )
}

const BLANK: Partial<Post> = { title: "", summary: "", body: "", tags: [], published: false }

function Console({ onSignOut }: { onSignOut: () => void }) {
  const [posts, setPosts] = useState<Post[]>([])
  const [editing, setEditing] = useState<Partial<Post> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setPosts((await api.list()).posts)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const save = async () => {
    if (!editing?.title?.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      if (editing.id) await api.update(editing.id, editing)
      else await api.create(editing)
      setEditing(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string) => {
    // Deleting a post cannot be undone, and the list gives no second chance.
    if (!window.confirm("Delete this post permanently?")) return
    try {
      await api.remove(id)
      if (editing?.id === id) setEditing(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const signOut = async () => {
    await api.logout().catch(() => {})
    onSignOut()
  }

  if (editing) {
    return (
      <Editor
        value={editing}
        busy={busy}
        error={error}
        onChange={setEditing}
        onSave={save}
        onCancel={() => {
          setEditing(null)
          setError(null)
        }}
      />
    )
  }

  return (
    <>
      <section className="hero">
        <div className="row">
          <div>
            <h1>Newsroom</h1>
            <p>{posts.length} post{posts.length === 1 ? "" : "s"}</p>
          </div>
          <span className="spacer" />
          <button className="primary" onClick={() => setEditing({ ...BLANK })}>
            New post
          </button>
          <button onClick={signOut}>Sign out</button>
        </div>
      </section>

      {error && <p className="error">{error}</p>}

      {posts.length === 0 && (
        <div className="notice" style={{ marginTop: 24 }}>No posts yet.</div>
      )}

      {posts.map((p) => (
        <article className="post" key={p.id}>
          <div className="row">
            <div style={{ minWidth: 0 }}>
              <h2 style={{ marginBottom: 4 }}>{p.title}</h2>
              <div className="meta">
                <span>{formatDate(p.created)}</span>
                {p.published ? (
                  <span className="tag">published</span>
                ) : (
                  <span className="badge-draft">draft</span>
                )}
                {p.tags.map((t) => (
                  <span className="tag" key={t}>{t}</span>
                ))}
              </div>
            </div>
            <span className="spacer" />
            <button onClick={() => setEditing(p)}>Edit</button>
            <button className="danger" onClick={() => remove(p.id)}>Delete</button>
          </div>
        </article>
      ))}
    </>
  )
}

function Editor({
  value,
  busy,
  error,
  onChange,
  onSave,
  onCancel,
}: {
  value: Partial<Post>
  busy: boolean
  error: string | null
  onChange: (next: Partial<Post>) => void
  onSave: () => void
  onCancel: () => void
}) {
  const set = <K extends keyof Post>(key: K, v: Post[K]) => onChange({ ...value, [key]: v })

  return (
    <section style={{ padding: "32px 0" }}>
      <div className="row">
        <h1 style={{ margin: 0, fontSize: 20, color: "var(--white)" }}>
          {value.id ? "Edit post" : "New post"}
        </h1>
        <span className="spacer" />
        <button onClick={onCancel}>Cancel</button>
        <button className="primary" onClick={onSave} disabled={busy || !value.title?.trim()}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>

      <label htmlFor="title">Title</label>
      <input id="title" value={value.title ?? ""} onChange={(e) => set("title", e.target.value)} />

      <label htmlFor="summary">Summary</label>
      <input
        id="summary"
        value={value.summary ?? ""}
        placeholder="One line shown in the feed"
        onChange={(e) => set("summary", e.target.value)}
      />

      <label htmlFor="tags">Tags</label>
      <input
        id="tags"
        value={(value.tags ?? []).join(", ")}
        placeholder="release, cli, desktop"
        onChange={(e) => set("tags", e.target.value.split(",").map((t) => t.trim()).filter(Boolean))}
      />

      <label htmlFor="body">Body</label>
      <textarea id="body" value={value.body ?? ""} onChange={(e) => set("body", e.target.value)} />
      <p className="muted" style={{ marginTop: 6 }}>
        Markdown supported — headings, bold, lists, code blocks, tables and links.
      </p>

      <label style={{ display: "flex", alignItems: "center", gap: 8, textTransform: "none", letterSpacing: 0, fontSize: 13, color: "var(--text)" }}>
        <input
          type="checkbox"
          checked={!!value.published}
          onChange={(e) => set("published", e.target.checked)}
          style={{ width: "auto" }}
        />
        Published — visible to everyone
      </label>

      {error && <p className="error">{error}</p>}
    </section>
  )
}
