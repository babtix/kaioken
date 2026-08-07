/**
 * The accent a card leans on. Content files name a tone; these maps turn it
 * into classes. Kept as complete literal strings so Tailwind sees them.
 */
export type Tone = "orange" | "amber" | "blue" | "green" | "sage"

export const toneText: Record<Tone, string> = {
  orange: "text-kai-orange",
  amber: "text-kai-amber",
  blue: "text-kai-blue",
  green: "text-kai-green",
  sage: "text-kai-sage",
}

export const toneSurface: Record<Tone, string> = {
  orange: "border-kai-orange/25 bg-kai-orange/[0.07]",
  amber: "border-kai-amber/25 bg-kai-amber/[0.07]",
  blue: "border-kai-blue/25 bg-kai-blue/[0.07]",
  green: "border-kai-green/25 bg-kai-green/[0.07]",
  sage: "border-kai-sage/25 bg-kai-sage/[0.07]",
}

export const toneBorder: Record<Tone, string> = {
  orange: "border-kai-orange/40",
  amber: "border-kai-amber/40",
  blue: "border-kai-blue/40",
  green: "border-kai-green/40",
  sage: "border-kai-sage/40",
}

/** Falls back to orange for any tone a content file invents. */
export function tone(value: string): Tone {
  return (["orange", "amber", "blue", "green", "sage"] as const).includes(value as Tone)
    ? (value as Tone)
    : "orange"
}
