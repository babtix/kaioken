import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

// One markdown renderer for READMEs and docs. react-markdown never renders
// raw HTML, so third-party README content stays inert by default.
export function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  )
}
