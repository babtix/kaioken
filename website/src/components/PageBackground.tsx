import { cn } from "@/lib/utils"

/**
 * The page-wide backdrop.
 *
 * `full` — a coarse panel mesh, a phosphor dot matrix, the terminal character
 * grid under the hero, three slow blooms, scanlines and a vignette. For the
 * two pages that are shopfronts: home and desktop.
 *
 * `simple` — the same mesh and dot matrix with a single faint bloom, and none
 * of the texture that sits on top of type. Docs, showcase, roadmap and the
 * wiki preview are reading surfaces; they get the material, not the show.
 *
 * Fixed rather than absolute so the blooms sit still while the page scrolls —
 * a parallax backdrop on a page this long reads as drift, not depth. Pure CSS:
 * the landing hero already spends a WebGL context, and one is enough.
 *
 * Note the whole thing depends on no ancestor painting an opaque background:
 * a non-positioned block's background paints *above* a -z-10 descendant, which
 * is why App's page wrapper deliberately carries no bg utility.
 */
export default function PageBackground({
  className,
  variant = "full",
}: {
  className?: string
  variant?: "full" | "simple"
}) {
  const simple = variant === "simple"

  return (
    <div
      aria-hidden
      className={cn("pointer-events-none fixed inset-0 -z-10 overflow-hidden", className)}
    >
      {/* the black the rest of the palette is measured against */}
      <div className="absolute inset-0 bg-background" />

      {/* coarse mesh, then the finer dot matrix on top of it */}
      <div className={cn("kai-mesh kai-fade-down absolute inset-0", simple ? "opacity-40" : "opacity-60")} />
      <div className={cn("kai-dots kai-fade-down absolute inset-0", simple ? "opacity-30" : "opacity-45")} />

      {simple ? (
        /* two quiet light sources — orange overhead + secondary amber — so glass panels catch light */
        <>
          <div className="animate-bloom kai-bloom absolute -top-[28vh] left-1/2 h-[65vh] w-[90vw] -translate-x-1/2 bg-kai-orange/[0.10]" />
          <div
            className="animate-bloom kai-bloom absolute -bottom-[20vh] -right-[10vw] h-[40vh] w-[40vw] bg-kai-amber/[0.05]"
            style={{ animationDelay: "-12s" }}
          />
        </>
      ) : (
        <>
          {/* character grid, only where the hero sits */}
          <div className="term-grid kai-fade-hero absolute inset-x-0 top-0 h-screen opacity-80" />

          {/* three off-screen light sources — slightly brighter for glass reflections */}
          <div className="animate-bloom kai-bloom absolute -top-[28vh] left-1/2 h-[75vh] w-[90vw] -translate-x-1/2 bg-kai-orange/[0.14]" />
          <div
            className="animate-bloom kai-bloom absolute -bottom-[25vh] -left-[15vw] h-[55vh] w-[50vw] bg-kai-red/[0.09]"
            style={{ animationDelay: "-9s" }}
          />
          <div
            className="animate-bloom kai-bloom absolute -right-[15vw] bottom-[-20vh] h-[55vh] w-[50vw] bg-kai-amber/[0.08]"
            style={{ animationDelay: "-17s" }}
          />

          {/* CRT texture — omitted in simple, it costs contrast on long copy */}
          <div className="kai-scanlines absolute inset-0 opacity-25" />
        </>
      )}

      {/* the vignette that pushes the edges back */}
      <div className="kai-vignette absolute inset-0" />
    </div>
  )
}
