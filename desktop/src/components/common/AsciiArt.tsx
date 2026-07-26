import { cn } from "@/lib/utils"

/* Renders ASCII art with the site's signature left-to-right red→orange
   gradient (#ff0000 → #ff8600). Box-drawing characters drop to a 40%
   shade so the block fills lead — the same treatment as the hero logo. */
const BOX_CHARS = new Set(["╗", "║", "╔", "╝", "═", "╚"])

function charColor(ch: string, x: number, width: number) {
  const g = Math.round((134 * x) / (width - 1))
  return BOX_CHARS.has(ch) ? `rgb(102, ${Math.round(g * 0.4)}, 0)` : `rgb(255, ${g}, 0)`
}

export default function AsciiArt({
  art,
  label,
  className,
}: {
  art: string
  label: string
  className?: string
}) {
  const raw = art.split("\n")
  const width = Math.max(...raw.map((l) => [...l].length))
  const lines = raw.map((l) => l.padEnd(width, " "))

  return (
    <pre
      aria-label={label}
      className={cn(
        "inline-block text-left font-mono leading-[1.1] font-extrabold",
        className
      )}
    >
      {lines.map((line, y) => (
        <span key={y} className="block">
          {[...line].map((ch, x) => (
            <span key={x} style={{ color: charColor(ch, x, width) }}>
              {ch}
            </span>
          ))}
        </span>
      ))}
    </pre>
  )
}
