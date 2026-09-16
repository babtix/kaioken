import { cn } from "@/lib/utils"
import homeBg from "@/assets/home-bg.jpg"

export default function PageBackground({
  className,
}: {
  className?: string
  variant?: "full" | "simple"
}) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none fixed inset-0 z-0 overflow-hidden select-none", className)}
    >
      {/* Blurred wallpaper background image (matching Home page) */}
      <div
        className="home-bg-layer absolute -inset-[40px] bg-cover bg-center bg-no-repeat transition-all duration-700"
        style={{
          backgroundImage: `url(${homeBg})`,
          filter: "blur(14px)",
          transform: "scale(1.06)",
          opacity: 0.94,
        }}
      />

      {/* Dark contrast scrim */}
      <div className="home-bg-overlay absolute inset-0 bg-black/35" />

      {/* Depth vignette — themed in CSS (dark: deepen, light: wash out) */}
      <div className="home-bg-vignette absolute inset-0" />

      {/* Hairline technical grid overlay */}
      <div className="tech-grid-bg absolute inset-0 opacity-20" />

      {/* Light theme adaptation */}
      <div className="home-bg-light-scrim pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300" />
    </div>
  )
}
