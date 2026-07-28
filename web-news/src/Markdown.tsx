import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"

// Renders a post body as GitHub-flavoured Markdown. Styling lives in styles.css
// under `.body ...` so the terminal palette applies to every element; here we
// only override links (open off-site safely) and drop the default <pre> wrapper
// so the fenced-code styling is driven by `.body pre`.
const components: Components = {
  a: ({ href, children }) => {
    if (!href) return <>{children}</>
    const external = /^https?:/i.test(href)
    return (
      <a href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        {children}
      </a>
    )
  },
}

export default function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  )
}
