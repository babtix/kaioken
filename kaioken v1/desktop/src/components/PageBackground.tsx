import { cn } from "@/lib/utils"

export default function PageBackground({
  className,
}: {
  className?: string
}) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none", className)}
    >
      {/* Deep dark glass base */}
      <div className="absolute inset-0 bg-[#09090b]" />

      {/* Frost Glass Ice-White Glow & Lens Flares */}
      <div className="animate-bloom kai-bloom absolute -top-[35vh] left-1/2 h-[70vh] w-[75vw] -translate-x-1/2 bg-white/[0.08]" />
      <div
        className="animate-bloom kai-bloom absolute top-[20vh] left-1/2 h-[45vh] w-[55vw] -translate-x-1/2 bg-white/[0.04]"
        style={{ animationDelay: "-10s" }}
      />
      <div
        className="animate-bloom kai-bloom absolute -bottom-[20vh] -left-[10vw] h-[50vh] w-[45vw] bg-kai-orange/[0.06]"
        style={{ animationDelay: "-16s" }}
      />

      {/* Glass vignette */}
      <div className="kai-vignette absolute inset-0" />
    </div>
  )
}
