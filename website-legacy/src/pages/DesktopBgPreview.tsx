import * as React from "react"
import { ArrowRight, Check, ChevronDown, ChevronUp, Eye, EyeOff, Search, Sparkles, Terminal } from "lucide-react"
import LinkButton from "@/components/LinkButton"
import GithubMark from "@/components/GithubMark"
import PageBackground from "@/components/PageBackground"
import { scrollToAnchor } from "@/lib/scroll"
import { DESKTOP_STATS, DESKTOP_REPO_PATH } from "@/data/desktop"

const FaultyTerminal = React.lazy(() => import("@/bits/FaultyTerminal"))

export type BgVariant = string

interface VariantOption {
  id: BgVariant
  num: number
  category: 
    | "Cyber & TUI" 
    | "React Bits & WebGL" 
    | "Shader Particles" 
    | "Glassmorphism" 
    | "Blueprint HUD" 
    | "Minimal & Monochrome"
    | "Particle Waves & Silk"
    | "Beams & Light FX"
    | "Cyber & Retro Synth"
    | "Ultra Premium & Masterpiece"
  name: string
  desc: string
  badge: string
}

const VARIANTS: VariantOption[] = [
  // Category 1: Cyber & TUI (1-10)
  { id: "cyber-ambient", num: 1, category: "Cyber & TUI", name: "Cyber Ambient", desc: "Soft orange & amber phosphor glow with CRT scanlines.", badge: "Minimal & Clean" },
  { id: "blueprint-mesh", num: 2, category: "Cyber & TUI", name: "Blueprint Mesh", desc: "Dual-tone Blue & Orange windowing grid.", badge: "Dual-Tone HUD" },
  { id: "phosphor-grid", num: 3, category: "Cyber & TUI", name: "Phosphor Grid", desc: "Coarse panel mesh & dot matrix.", badge: "Classic TUI" },
  { id: "circuit-matrix", num: 4, category: "Cyber & TUI", name: "Circuit Network", desc: "Emerald & cyan circuit nodes.", badge: "Cyber Circuit" },
  { id: "pure-carbon", num: 5, category: "Cyber & TUI", name: "Pure Carbon", desc: "Clean matte dark background with zero grid.", badge: "Zero Distraction" },
  { id: "faulty-terminal", num: 6, category: "Cyber & TUI", name: "FaultyTerminal", desc: "The animated WebGL terminal shader.", badge: "WebGL Shader" },
  { id: "kaioken-aura", num: 7, category: "Cyber & TUI", name: "Kaioken Aura", desc: "Crimson & orange power aura glow.", badge: "Crimson Power" },
  { id: "cosmic-nebula", num: 8, category: "Cyber & TUI", name: "Cosmic Nebula", desc: "Electric violet & cyan space nebula.", badge: "Violet & Cyan" },
  { id: "tactical-radar", num: 9, category: "Cyber & TUI", name: "Tactical Radar", desc: "Military HUD reticle ring & radar grid.", badge: "Tactical HUD" },
  { id: "neon-sunset", num: 10, category: "Cyber & TUI", name: "Neon Sunset", desc: "Synthwave magenta & amber horizon glow.", badge: "Synthwave" },

  // Category 2: React Bits & WebGL (11-20)
  { id: "monochrome-glass", num: 11, category: "React Bits & WebGL", name: "Frost Glass", desc: "Dark glass base with ice-white lens flares.", badge: "Dark Glass" },
  { id: "perspective-grid", num: 12, category: "React Bits & WebGL", name: "3D Horizon Grid", desc: "Retro 3D wireframe perspective horizon.", badge: "3D Wireframe" },
  { id: "solar-flare", num: 13, category: "React Bits & WebGL", name: "Solar Flare", desc: "Solar gold & amber flame aura blooms.", badge: "Solar Gold" },
  { id: "deep-abyss", num: 14, category: "React Bits & WebGL", name: "Deep Abyss", desc: "Navy ocean abyss with royal sapphire blue flares.", badge: "Abyss Blue" },
  { id: "obsidian-gold", num: 15, category: "React Bits & WebGL", name: "Obsidian Gold", desc: "Matte obsidian with 24K gold geometric lines.", badge: "Obsidian 24K" },
  { id: "matrix-rain", num: 16, category: "React Bits & WebGL", name: "Matrix Rain", desc: "Green digital code stream matrix rain.", badge: "Matrix Stream" },
  { id: "hyperdrive-stars", num: 17, category: "React Bits & WebGL", name: "Hyperdrive Stars", desc: "Radial speed lines radiating from logo.", badge: "Hyperdrive" },
  { id: "plasma-wave", num: 18, category: "React Bits & WebGL", name: "Plasma Wave", desc: "Neon pink & electric violet plasma waves.", badge: "Neon Plasma" },
  { id: "quantum-grid", num: 19, category: "React Bits & WebGL", name: "Quantum Grid", desc: "Cyan & emerald sub-atomic quantum mesh.", badge: "Quantum Mesh" },
  { id: "dark-vapor", num: 20, category: "React Bits & WebGL", name: "Dark Vapor", desc: "Rolling phosphor smoke vignette.", badge: "Dark Vapor" },

  // Category 3: Shader Particles (21-30)
  { id: "electric-storm", num: 21, category: "Shader Particles", name: "Electric Storm", desc: "Lightning blue & violet plasma pulses.", badge: "Plasma Lightning" },
  { id: "cyberpunk-2077", num: 22, category: "Shader Particles", name: "Cyberpunk 2077", desc: "Hot pink & electric yellow neon grid.", badge: "Neon Cyber" },
  { id: "deep-trench", num: 23, category: "Shader Particles", name: "Deep Trench", desc: "Bioluminescent teal underwater glow.", badge: "Bio Teal" },
  { id: "supernova-core", num: 24, category: "Shader Particles", name: "Supernova Core", desc: "White-hot energy core with golden rays.", badge: "Golden Core" },
  { id: "arcade-crt", num: 25, category: "Shader Particles", name: "Arcade CRT", desc: "Curved phosphor scanline monitor texture.", badge: "Retro CRT" },
  { id: "void-eclipse", num: 26, category: "Shader Particles", name: "Void Eclipse", desc: "Pitch black center with bright ring corona.", badge: "Eclipse Corona" },
  { id: "hacker-green", num: 27, category: "Shader Particles", name: "Hacker Terminal", desc: "Classic terminal hacker green phosphors.", badge: "Green Terminal" },
  { id: "amber-crt", num: 28, category: "Shader Particles", name: "Amber Vintage CRT", desc: "Monochrome amber vintage CRT glow.", badge: "Amber Vintage" },
  { id: "glitch-noise", num: 29, category: "Shader Particles", name: "Glitch Bands", desc: "Horizontal digital noise glitch bands.", badge: "Glitch FX" },
  { id: "laser-sweep", num: 30, category: "Shader Particles", name: "Laser Grid Sweep", desc: "Sweeping red laser beam horizon grid.", badge: "Laser Sweep" },

  // Category 4: Glassmorphism (31-40)
  { id: "nordic-aurora", num: 31, category: "Glassmorphism", name: "Nordic Aurora", desc: "Borealis green & cyan aurora borealis.", badge: "Aurora Glow" },
  { id: "midnight-velvet", num: 32, category: "Glassmorphism", name: "Midnight Velvet", desc: "Deep indigo & plum velvet blooms.", badge: "Velvet Indigo" },
  { id: "titanium-stealth", num: 33, category: "Glassmorphism", name: "Titanium Steel", desc: "Metallic charcoal brushed steel glow.", badge: "Brushed Steel" },
  { id: "synth-sunset", num: 34, category: "Glassmorphism", name: "Synthwave Sunset", desc: "Gradient retro purple sunset glow.", badge: "Purple Sunset" },
  { id: "cyber-coral", num: 35, category: "Glassmorphism", name: "Cyber Coral", desc: "Vibrant coral orange & electric blue.", badge: "Coral Contrast" },
  { id: "dark-opal", num: 36, category: "Glassmorphism", name: "Dark Opal", desc: "Iridescent dark jewel tones.", badge: "Jewel Opal" },
  { id: "monochrome-slate", num: 37, category: "Glassmorphism", name: "Monochrome Slate", desc: "Minimal grey slate & silver flares.", badge: "Silver Slate" },
  { id: "inferno-magma", num: 38, category: "Glassmorphism", name: "Inferno Magma", desc: "Pulsing magma orange & volcanic red.", badge: "Magma Pulse" },
  { id: "neon-city", num: 39, category: "Glassmorphism", name: "Neon City Trails", desc: "Cyberpunk city skyline light trails.", badge: "City Lights" },
  { id: "polkadot-matrix", num: 40, category: "Glassmorphism", name: "Polkadot Array", desc: "Micro dot matrix phosphor array.", badge: "Micro Dot" },

  // Category 5: Blueprint HUD (41-50)
  { id: "hex-hive", num: 41, category: "Blueprint HUD", name: "Hexagon Hive", desc: "Honeycomb hex cell layout grid.", badge: "Hex Hive" },
  { id: "aperture-hud", num: 42, category: "Blueprint HUD", name: "Aperture HUD", desc: "Rotating mechanical aperture rings.", badge: "Mechanical HUD" },
  { id: "isogrid-space", num: 43, category: "Blueprint HUD", name: "Isogrid Mesh", desc: "Triangular isometric space mesh.", badge: "Isometric Mesh" },
  { id: "sonar-depth", num: 44, category: "Blueprint HUD", name: "Sonar Depth", desc: "Concentrically pulsing sonar rings.", badge: "Sonar Pulse" },
  { id: "crosshair-grid", num: 45, category: "Blueprint HUD", name: "Precision Target", desc: "Precision military crosshair grid.", badge: "Target Reticle" },
  { id: "diamond-lattice", num: 46, category: "Blueprint HUD", name: "Diamond Lattice", desc: "Crystalline diamond pattern grid.", badge: "Diamond Lattice" },
  { id: "chrono-gears", num: 47, category: "Blueprint HUD", name: "Chrono Clockwork", desc: "Concentric gear ring outlines.", badge: "Chrono HUD" },
  { id: "telemetry-ladder", num: 48, category: "Blueprint HUD", name: "Telemetry HUD", desc: "Flight telemetry lines & pitch ladders.", badge: "Flight HUD" },
  { id: "frequency-spectrum", num: 49, category: "Blueprint HUD", name: "Audio Spectrum", desc: "Equalizer spectrum bars backdrop.", badge: "Audio Spectrum" },
  { id: "vortex-grid", num: 50, category: "Blueprint HUD", name: "Vortex Horizon", desc: "Swirling gravitational vortex grid.", badge: "Gravity Vortex" },

  // Category 6: Minimal & Monochrome (51-60)
  { id: "obsidian-matte", num: 51, category: "Minimal & Monochrome", name: "Obsidian Matte", desc: "Ultra-deep zero-light black base.", badge: "Pure Black" },
  { id: "charcoal-vignette", num: 52, category: "Minimal & Monochrome", name: "Charcoal Spotlight", desc: "Subtle center spotlight on dark grey.", badge: "Soft Spotlight" },
  { id: "sketch-grid", num: 53, category: "Minimal & Monochrome", name: "Draft Sketch Grid", desc: "Minimalist fine 1px draft grid.", badge: "1px Draft Grid" },
  { id: "tv-static", num: 54, category: "Minimal & Monochrome", name: "TV Static Noise", desc: "Very fine analogue television static.", badge: "Analogue Static" },
  { id: "ghost-orb", num: 55, category: "Minimal & Monochrome", name: "Ghost Orb Flare", desc: "Floating ghost light orb background.", badge: "Ghost Flare" },
  { id: "zen-monolith", num: 56, category: "Minimal & Monochrome", name: "Zen Monolith", desc: "Clean central pillar light bloom.", badge: "Zen Bloom" },
  { id: "arctic-white", num: 57, category: "Minimal & Monochrome", name: "Arctic Ice Flares", desc: "Crisp arctic white ambient glow.", badge: "Arctic White" },
  { id: "steel-blue", num: 58, category: "Minimal & Monochrome", name: "Midnight Steel", desc: "Cool dark steel blue backdrop.", badge: "Steel Blue" },
  { id: "copper-glow", num: 59, category: "Minimal & Monochrome", name: "Burnished Copper", desc: "Warm burnished copper ambient glow.", badge: "Copper Warmth" },
  { id: "ultimate-kaioken", num: 60, category: "Minimal & Monochrome", name: "Ultimate Kaioken Burst", desc: "Full-power aura burst with dual red/orange flares.", badge: "Full Power 60" },

  // Category 7: Particle Waves & Silk (61-70)
  { id: "particle-waves", num: 61, category: "Particle Waves & Silk", name: "Particle Field Waves", desc: "Flowing floating particle wave mesh.", badge: "Particle Mesh" },
  { id: "fluid-silk", num: 62, category: "Particle Waves & Silk", name: "Fluid Silk Motion", desc: "Liquid dark silk ribbon wave curves.", badge: "Liquid Silk" },
  { id: "hyperspeed-warp", num: 63, category: "Particle Waves & Silk", name: "Hyperspeed Warp", desc: "Warp speed stars & light trails.", badge: "Star Warp" },
  { id: "liquid-chrome", num: 64, category: "Particle Waves & Silk", name: "Liquid Chrome Metal", desc: "Molten liquid metal reflections.", badge: "Liquid Chrome" },
  { id: "gravity-ballpit", num: 65, category: "Particle Waves & Silk", name: "Gravity Ballpit Orbs", desc: "Bouncing dark energy spheres.", badge: "Gravity Orbs" },
  { id: "wave-threads", num: 66, category: "Particle Waves & Silk", name: "Wave Threads", desc: "Interwoven luminous fiber optic threads.", badge: "Fiber Threads" },
  { id: "borealis-curtain", num: 67, category: "Particle Waves & Silk", name: "Borealis Curtain", desc: "Ethereal green & violet aurora curtain.", badge: "Aurora Curtain" },
  { id: "grid-motion", num: 68, category: "Particle Waves & Silk", name: "Grid Motion Floor", desc: "Endless moving cyber perspective floor.", badge: "Motion Floor" },
  { id: "letter-glitch", num: 69, category: "Particle Waves & Silk", name: "Letter Glitch Code", desc: "Flowing ASCII character glitch stream.", badge: "ASCII Code" },
  { id: "star-network", num: 70, category: "Particle Waves & Silk", name: "Constellation Network", desc: "Connected star cluster constellation nodes.", badge: "Star Network" },

  // Category 8: Beams & Light FX (71-80)
  { id: "light-beams", num: 71, category: "Beams & Light FX", name: "Volumetric Beams", desc: "Volumetric searchlight shafts & rays.", badge: "Light Beams" },
  { id: "perlin-noise", num: 72, category: "Beams & Light FX", name: "Cinematic Film Grain", desc: "Cinematic analogue film grain & noise.", badge: "Film Grain" },
  { id: "organic-liquid", num: 73, category: "Beams & Light FX", name: "Organic Liquid Plasma", desc: "Swirling organic liquid light glow.", badge: "Organic Plasma" },
  { id: "iridescent-mesh", num: 74, category: "Beams & Light FX", name: "Iridescent Mesh", desc: "Soft shifting iridescent spectrum aura.", badge: "Iridescent" },
  { id: "geometric-poly", num: 75, category: "Beams & Light FX", name: "Geometric Polyhedron", desc: "Wireframe 3D geometric crystal shape.", badge: "Polyhedron" },
  { id: "decayed-crt", num: 76, category: "Beams & Light FX", name: "Decayed Grunge CRT", desc: "Vintage degraded phosphor TV screen.", badge: "Grunge CRT" },
  { id: "steel-weave", num: 77, category: "Beams & Light FX", name: "Steel Weave Mesh", desc: "Cross-hatched industrial steel mesh.", badge: "Steel Weave" },
  { id: "prism-refract", num: 78, category: "Beams & Light FX", name: "Prism Spectrum", desc: "Prism light split spectrum flares.", badge: "Prism Refract" },
  { id: "pulse-spectrum", num: 79, category: "Beams & Light FX", name: "Pulse Waveform", desc: "Pulsing soundwave audio frequencies.", badge: "Sound Waveform" },
  { id: "orbital-ring", num: 80, category: "Beams & Light FX", name: "Orbital Gravity Ring", desc: "Pulsing planetary gravity rings.", badge: "Gravity Ring" },

  // Category 9: Cyber & Retro Synth (81-90)
  { id: "synth-horizon", num: 81, category: "Cyber & Retro Synth", name: "80s Synth Horizon", desc: "Retro 80s grid with magenta sun.", badge: "80s Synth" },
  { id: "neon-skyline", num: 82, category: "Cyber & Retro Synth", name: "Neon Skyscraper Grid", desc: "Outlined neon skyscraper city grid.", badge: "Neon City" },
  { id: "vapor-dream", num: 83, category: "Cyber & Retro Synth", name: "Vaporwave Dream", desc: "Pastel purple & cyan vaporwave fog.", badge: "Vaporwave" },
  { id: "hex-scanner", num: 84, category: "Cyber & Retro Synth", name: "Hex Grid Scanner", desc: "Sweeping hexagonal scanner beam.", badge: "Hex Scanner" },
  { id: "holo-reticle", num: 85, category: "Cyber & Retro Synth", name: "Holo Scope Target", desc: "Futuristic 3D holo-scope target reticle.", badge: "Holo Target" },
  { id: "sea-biolum", num: 86, category: "Cyber & Retro Synth", name: "Bioluminescence", desc: "Sub-aquatic glowing plankton dots.", badge: "Biolum Dots" },
  { id: "solar-coronal", num: 87, category: "Cyber & Retro Synth", name: "Solar Coronal Loops", desc: "Violent solar coronal flare loops.", badge: "Coronal Flare" },
  { id: "binary-waterfall", num: 88, category: "Cyber & Retro Synth", name: "Binary Stream 01", desc: "Descending 01 binary digital rain.", badge: "Binary Stream" },
  { id: "quantum-tunnel", num: 89, category: "Cyber & Retro Synth", name: "Quantum Warp Tunnel", desc: "Accelerating sub-atomic warp tunnel.", badge: "Warp Tunnel" },
  { id: "dark-lensing", num: 90, category: "Cyber & Retro Synth", name: "Dark Matter Lensing", desc: "Gravitational dark matter lensing effect.", badge: "Dark Lensing" },

  // Category 10: Ultra Premium & Masterpiece (91-100)
  { id: "carbon-alloy", num: 91, category: "Ultra Premium & Masterpiece", name: "Titanium Carbon Weave", desc: "Carbon fiber titanium lattice pattern.", badge: "Carbon Weave" },
  { id: "celestial-stars", num: 92, category: "Ultra Premium & Masterpiece", name: "Celestial Galaxy", desc: "Deep galaxy star field backdrop.", badge: "Galaxy Field" },
  { id: "volcanic-embers", num: 93, category: "Ultra Premium & Masterpiece", name: "Volcanic Embers", desc: "Rising ember sparks & molten glow.", badge: "Volcanic Ember" },
  { id: "ice-crystals", num: 94, category: "Ultra Premium & Masterpiece", name: "Ice Crystal Frost", desc: "Crystalline ice frost geometric patterns.", badge: "Ice Crystals" },
  { id: "emerald-cipher", num: 95, category: "Ultra Premium & Masterpiece", name: "Emerald Cipher", desc: "Encrypted green cipher network nodes.", badge: "Cipher Net" },
  { id: "sapphire-velvet", num: 96, category: "Ultra Premium & Masterpiece", name: "Royal Sapphire", desc: "Deep royal blue velvet ambient glow.", badge: "Royal Sapphire" },
  { id: "golden-sunrise", num: 97, category: "Ultra Premium & Masterpiece", name: "Golden Horizon Ray", desc: "Sunrise horizon light rays & gold dust.", badge: "Golden Ray" },
  { id: "global-cybernet", num: 98, category: "Ultra Premium & Masterpiece", name: "Global Cybernet", desc: "Interconnected global network lines.", badge: "Global Net" },
  { id: "monolith-flare", num: 99, category: "Ultra Premium & Masterpiece", name: "Monolith Flare", desc: "Monolithic glowing phosphor pillar.", badge: "Phosphor Pillar" },
  { id: "master-kaioken-100", num: 100, category: "Ultra Premium & Masterpiece", name: "100x Master Kaioken", desc: "Full-power 100x Kaioken aura burst with dual red/orange flares.", badge: "100x Kaioken MAX" },
]

const CATEGORIES = [
  "All (100)", 
  "Cyber & TUI", 
  "React Bits & WebGL", 
  "Shader Particles", 
  "Glassmorphism", 
  "Blueprint HUD", 
  "Minimal & Monochrome",
  "Particle Waves & Silk",
  "Beams & Light FX",
  "Cyber & Retro Synth",
  "Ultra Premium & Masterpiece"
] as const

export default function DesktopBgPreview() {
  const [selected, setSelected] = React.useState<BgVariant>("monochrome-glass")
  const [activeCategory, setActiveCategory] = React.useState<string>("All (100)")
  const [searchQuery, setSearchQuery] = React.useState("")
  const [dockOpen, setDockOpen] = React.useState(true)
  const [hideUI, setHideUI] = React.useState(false)

  const filteredVariants = React.useMemo(() => {
    return VARIANTS.filter((v) => {
      const matchCat = activeCategory === "All (100)" || v.category === activeCategory
      const matchQuery =
        !searchQuery ||
        v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.badge.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.num.toString() === searchQuery
      return matchCat && matchQuery
    })
  }, [activeCategory, searchQuery])

  const activeOption = VARIANTS.find((v) => v.id === selected) || VARIANTS[10]

  return (
    <div className="relative min-h-screen pb-44">
      {/* Dynamic Background Renderer */}
      <RenderBackground variant={selected} />

      {/* ── Unobstructed Hero Section ───────────────────────────────────── */}
      <section className="relative isolate overflow-hidden pt-8 pb-10">
        <div className="mx-auto max-w-6xl px-4 pt-8 pb-10 sm:px-6 sm:pt-12 sm:pb-14">
          <div className="animate-rise text-center">
            <div className="mb-7">
              <a
                href="#surfaces"
                onClick={(e) => scrollToAnchor(e, "surfaces")}
                className="inline-flex items-center gap-2 rounded-sm border border-kai-orange/30 bg-kai-orange/10 px-2.5 py-1 font-mono text-[11px] text-kai-amber transition-colors hover:border-kai-orange/60 hover:bg-kai-orange/15"
              >
                <span className="size-1.5 rounded-full bg-kai-green shadow-[0_0_6px_-1px_var(--kai-green)]" />
                Tauri v2 · same binary, same .kaioken/
              </a>
            </div>

            {/* Colored ASCII logo — exact HTML from DESKTOP APP-logo.html */}
            <div
              className="mx-auto inline-block max-w-full overflow-hidden text-center"
              aria-label="DESKTOP APP"
              dangerouslySetInnerHTML={{
                __html: `<div style="font-family:'JetBrains Mono','Courier New',monospace;font-size:clamp(5px,1.1vw,14px);line-height:1.25;font-weight:800;white-space:pre;display:inline-block"><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span><span style="color:#663600"> </span> <span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span> <span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span> <span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span><span style="color:#ff8700"> </span><span style="color:#ff8700"> </span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span> <span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span>  <span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span><span style="color:#663600"> </span> <span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span><span style="color:#663600"> </span>      <span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span>  <span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span><span style="color:#663600"> </span> <span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span><span style="color:#663600"> </span>\n<span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╔</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╗</span> <span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╔</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#662b00">╝</span> <span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╔</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#662b00">╝</span> <span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">║</span><span style="color:#ff6c00"> </span><span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╔</span><span style="color:#662b00">╝</span> <span style="color:#662b00">╚</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╔</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#662b00">╝</span> <span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╔</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╗</span> <span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╔</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╗</span>     <span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╔</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╗</span> <span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╔</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╗</span> <span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╔</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╗</span>\n<span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">║</span><span style="color:#ff5100"> </span><span style="color:#ff5100"> </span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">║</span> <span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">╗</span><span style="color:#662000"> </span><span style="color:#662000"> </span> <span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">╗</span> <span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">╔</span><span style="color:#662000">╝</span><span style="color:#662000"> </span> <span style="color:#ff5100"> </span><span style="color:#ff5100"> </span><span style="color:#ff5100"> </span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">║</span><span style="color:#662000"> </span><span style="color:#662000"> </span><span style="color:#662000"> </span> <span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">║</span><span style="color:#ff5100"> </span><span style="color:#ff5100"> </span><span style="color:#ff5100"> </span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">║</span> <span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">╔</span><span style="color:#662000">╝</span>     <span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">║</span> <span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">╔</span><span style="color:#662000">╝</span> <span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">╔</span><span style="color:#662000">╝</span>\n<span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">║</span><span style="color:#ff3600"> </span><span style="color:#ff3600"> </span><span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">║</span> <span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">╔</span><span style="color:#661600">═</span><span style="color:#661600">═</span><span style="color:#661600">╝</span><span style="color:#661600"> </span><span style="color:#661600"> </span> <span style="color:#661600">╚</span><span style="color:#661600">═</span><span style="color:#661600">═</span><span style="color:#661600">═</span><span style="color:#661600">═</span><span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">║</span> <span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">╔</span><span style="color:#661600">═</span><span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">╗</span><span style="color:#661600"> </span> <span style="color:#ff3600"> </span><span style="color:#ff3600"> </span><span style="color:#ff3600"> </span><span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">║</span><span style="color:#661600"> </span><span style="color:#661600"> </span><span style="color:#661600"> </span> <span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">║</span><span style="color:#ff3600"> </span><span style="color:#ff3600"> </span><span style="color:#ff3600"> </span><span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">║</span> <span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">╔</span><span style="color:#661600">═</span><span style="color:#661600">═</span><span style="color:#661600">═</span><span style="color:#661600">╝</span><span style="color:#661600"> </span>     <span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">╔</span><span style="color:#661600">═</span><span style="color:#661600">═</span><span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">║</span> <span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">╔</span><span style="color:#661600">═</span><span style="color:#661600">═</span><span style="color:#661600">═</span><span style="color:#661600">╝</span><span style="color:#661600"> </span> <span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">╔</span><span style="color:#661600">═</span><span style="color:#661600">═</span><span style="color:#661600">═</span><span style="color:#661600">╝</span><span style="color:#661600"> </span>\n<span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">╔</span><span style="color:#660b00">╝</span> <span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">╗</span> <span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">║</span> <span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">║</span><span style="color:#ff1b00"> </span><span style="color:#ff1b00"> </span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">╗</span> <span style="color:#ff1b00"> </span><span style="color:#ff1b00"> </span><span style="color:#ff1b00"> </span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">║</span><span style="color:#660b00"> </span><span style="color:#660b00"> </span><span style="color:#660b00"> </span> <span style="color:#660b00">╚</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">╔</span><span style="color:#660b00">╝</span> <span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">║</span><span style="color:#660b00"> </span><span style="color:#660b00"> </span><span style="color:#660b00"> </span><span style="color:#660b00"> </span><span style="color:#660b00"> </span>     <span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">║</span><span style="color:#ff1b00"> </span><span style="color:#ff1b00"> </span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">║</span> <span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">║</span><span style="color:#660b00"> </span><span style="color:#660b00"> </span><span style="color:#660b00"> </span><span style="color:#660b00"> </span><span style="color:#660b00"> </span> <span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">║</span><span style="color:#660b00"> </span><span style="color:#660b00"> </span><span style="color:#660b00"> </span><span style="color:#660b00"> </span><span style="color:#660b00"> </span>\n<span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">╝</span><span style="color:#660000"> </span> <span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">╝</span> <span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">╝</span> <span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">╝</span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">╝</span> <span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">╝</span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000"> </span> <span style="color:#660000"> </span><span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">╝</span><span style="color:#660000"> </span> <span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">╝</span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000"> </span>     <span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">╝</span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">╝</span> <span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">╝</span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000"> </span> <span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">╝</span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000"> </span></div>`,
              }}
            />

            <p className="mx-auto mt-6 max-w-lg font-sans text-[15px] leading-relaxed text-balance text-muted-foreground">
              The CLI in a window. Diffs you can read, a wiki you can browse, runs you can watch.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <LinkButton href={DESKTOP_REPO_PATH} size="lg">
                <GithubMark data-icon="inline-start" />
                View source
              </LinkButton>
              <LinkButton to="/docs/install" variant="outline" size="lg">
                <Terminal className="size-4" data-icon="inline-start" />
                Get the CLI first
                <ArrowRight data-icon="inline-end" />
              </LinkButton>
            </div>

            <dl className="mx-auto mt-10 grid max-w-2xl grid-cols-2 divide-x divide-y divide-border rounded-md border border-border bg-card/50 backdrop-blur-sm sm:grid-cols-4 sm:divide-y-0">
              {DESKTOP_STATS.map((s) => (
                <div key={s.label} className="px-3 py-4 text-center">
                  <dt className="sr-only">{s.label}</dt>
                  <dd>
                    <span className="block font-mono text-3xl font-bold text-kai-orange">
                      {s.value}
                    </span>
                    <span className="font-mono text-[11px] tracking-wider text-kai-dim">
                      {s.label}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ── Main Gallery Section under Hero ─────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="rounded-lg border border-kai-orange/40 bg-card/95 p-6 shadow-2xl backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/70 pb-4">
            <div>
              <h2 className="flex items-center gap-2 font-mono text-lg font-bold text-kai-white">
                <Sparkles className="size-5 text-kai-orange" />
                React Bits & Backgrounds Vault (100 Options)
              </h2>
              <p className="mt-1 font-mono text-xs text-kai-amber">
                Showing {filteredVariants.length} of {VARIANTS.length} styles — Click any style to activate live:
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-kai-dim" />
                <input
                  type="text"
                  placeholder="Search 100 styles..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded border border-border bg-background/80 py-1.5 pl-8 pr-3 font-mono text-xs text-kai-text placeholder:text-kai-dim focus:border-kai-orange focus:outline-none"
                />
              </div>
              <button
                onClick={() => setHideUI(!hideUI)}
                className="inline-flex items-center gap-2 rounded border border-kai-orange/40 bg-kai-orange/10 px-3 py-1.5 font-mono text-xs text-kai-amber transition-colors hover:border-kai-orange hover:bg-kai-orange/20"
              >
                {hideUI ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                {hideUI ? "Show Quick Dock" : "Hide Quick Dock"}
              </button>
            </div>
          </div>

          {/* Category Tabs */}
          <div className="mt-4 flex flex-wrap gap-1.5 border-b border-border/40 pb-3">
            {CATEGORIES.map((cat) => {
              const active = activeCategory === cat
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`rounded-sm px-2.5 py-1 font-mono text-[11px] transition-colors ${
                    active
                      ? "bg-kai-orange text-kai-black font-bold shadow-md"
                      : "bg-background/80 text-kai-dim border border-border hover:border-kai-orange/40 hover:text-kai-text"
                  }`}
                >
                  {cat}
                </button>
              )
            })}
          </div>

          {/* Grid of 100 Options */}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {filteredVariants.map((v) => {
              const active = selected === v.id
              return (
                <button
                  key={v.id}
                  onClick={() => {
                    setSelected(v.id)
                    window.scrollTo({ top: 0, behavior: "smooth" })
                  }}
                  className={`group relative flex flex-col justify-between rounded-md border p-3 text-left font-mono transition-all outline-none ${
                    active
                      ? "border-kai-orange bg-kai-orange/20 text-kai-white ring-2 ring-kai-orange/60 shadow-xl"
                      : "border-border/80 bg-background/70 text-kai-dim hover:border-kai-orange/50 hover:bg-card hover:text-kai-text"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs truncate">#{v.num}. {v.name}</span>
                      {active && <Check className="size-4 text-kai-orange shrink-0 ml-1" />}
                    </div>
                    <span className="mt-1.5 block text-[10px] text-kai-muted group-hover:text-kai-amber">
                      {v.badge}
                    </span>
                  </div>
                  <p className="mt-2 text-[10px] leading-snug text-kai-dim/80">
                    {v.desc}
                  </p>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── Compact Bottom Quick Dock (Collapsible) ────────────────────── */}
      {!hideUI && (
        <div className="fixed bottom-4 left-1/2 z-50 w-full max-w-6xl -translate-x-1/2 px-4 transition-all">
          <div className="rounded-lg border border-kai-orange/50 bg-card/95 p-3 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-2">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-kai-green animate-pulse" />
                <span className="font-mono text-xs font-bold text-kai-white">
                  Active #{activeOption.num}: <span className="text-kai-orange">{activeOption.name}</span>
                </span>
                <span className="hidden font-mono text-[10px] text-kai-muted sm:inline">
                  ({activeOption.badge})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDockOpen(!dockOpen)}
                  className="inline-flex items-center gap-1 rounded border border-border bg-background/80 px-2 py-1 font-mono text-[10px] text-kai-amber hover:border-kai-orange"
                >
                  {dockOpen ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
                  {dockOpen ? "Minimize Dock" : "Expand 100 Switcher"}
                </button>
                <button
                  onClick={() => setHideUI(true)}
                  className="rounded border border-border bg-background/80 p-1 font-mono text-[10px] text-kai-muted hover:text-kai-orange"
                  title="Hide bottom dock completely"
                >
                  <EyeOff className="size-3.5" />
                </button>
              </div>
            </div>

            {dockOpen && (
              <div className="mt-2.5 max-h-32 overflow-y-auto pr-1">
                <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-12 md:grid-cols-15 lg:grid-cols-20">
                  {VARIANTS.map((v) => {
                    const active = selected === v.id
                    return (
                      <button
                        key={v.id}
                        onClick={() => setSelected(v.id)}
                        className={`truncate rounded border px-1 py-0.5 text-center font-mono text-[9px] transition-all outline-none ${
                          active
                            ? "border-kai-orange bg-kai-orange/30 font-bold text-kai-white ring-1 ring-kai-orange"
                            : "border-border/60 bg-background/60 text-kai-dim hover:border-kai-orange/40 hover:text-kai-text"
                        }`}
                        title={`#${v.num} ${v.name}: ${v.desc}`}
                      >
                        #{v.num}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating unhide button if dock was hidden */}
      {hideUI && (
        <button
          onClick={() => setHideUI(false)}
          className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-full border border-kai-orange/50 bg-card/90 px-4 py-2 font-mono text-xs font-semibold text-kai-amber shadow-2xl backdrop-blur-md hover:border-kai-orange hover:bg-kai-orange/20"
        >
          <Eye className="size-4 text-kai-orange" />
          Show 100-Style Quick Dock
        </button>
      )}
    </div>
  )
}

function RenderBackground({ variant }: { variant: BgVariant }) {
  switch (variant) {
    case "cyber-ambient":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-background" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-1/2 h-[70vh] w-[80vw] -translate-x-1/2 bg-kai-orange/14" />
          <div className="animate-bloom kai-bloom absolute top-[20vh] left-1/2 h-[45vh] w-[50vw] -translate-x-1/2 bg-kai-amber/10" style={{ animationDelay: "-7s" }} />
          <div className="kai-scanlines absolute inset-0 opacity-15" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "blueprint-mesh":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-background" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#87d7ff0a_1px,transparent_1px),linear-gradient(to_bottom,#ff87000a_1px,transparent_1px)] bg-[size:40px_40px]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff12_1px,transparent_1px),linear-gradient(to_bottom,#ffffff12_1px,transparent_1px)] bg-[size:160px_160px]" />
          <div className="animate-bloom kai-bloom absolute -top-[25vh] left-[15%] h-[60vh] w-[55vw] bg-kai-blue/15" />
          <div className="animate-bloom kai-bloom absolute -top-[20vh] right-[10%] h-[60vh] w-[55vw] bg-kai-orange/18" style={{ animationDelay: "-8s" }} />
          <div className="kai-scanlines absolute inset-0 opacity-20" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "phosphor-grid":
      return <PageBackground variant="full" />

    case "circuit-matrix":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-background" />
          <div className="absolute inset-0 bg-[radial-gradient(#00d78715_1px,transparent_1px)] bg-[size:32px_32px]" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-1/3 h-[60vh] w-[60vw] bg-kai-green/12" />
          <div className="animate-bloom kai-bloom absolute top-[15vh] right-1/4 h-[50vh] w-[50vw] bg-kai-blue/12" style={{ animationDelay: "-11s" }} />
          <div className="kai-scanlines absolute inset-0 opacity-25" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "pure-carbon":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#080808]" />
          <div className="animate-bloom kai-bloom absolute -top-[35vh] left-1/2 h-[65vh] w-[70vw] -translate-x-1/2 bg-kai-orange/[0.07]" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "faulty-terminal":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-background" />
          <div className="absolute inset-0 opacity-[0.55]">
            <React.Suspense fallback={null}>
              <FaultyTerminal
                scale={1.6}
                gridMul={[2, 1]}
                digitSize={1.4}
                timeScale={0.35}
                scanlineIntensity={0.55}
                glitchAmount={1}
                flickerAmount={0.7}
                noiseAmp={1}
                chromaticAberration={0}
                curvature={0.08}
                tint="#ff8700"
                mouseReact
                mouseStrength={0.35}
                dpr={1}
                fps={30}
                resolutionScale={0.5}
              />
            </React.Suspense>
          </div>
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "kaioken-aura":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-background" />
          <div className="animate-bloom kai-bloom absolute -top-[25vh] left-1/2 h-[75vh] w-[85vw] -translate-x-1/2 bg-[#ff2a00]/22" />
          <div className="animate-bloom kai-bloom absolute -top-[15vh] left-1/2 h-[50vh] w-[60vw] -translate-x-1/2 bg-[#ff8700]/18" style={{ animationDelay: "-6s" }} />
          <div className="animate-bloom kai-bloom absolute top-[30vh] left-1/2 h-[40vh] w-[50vw] -translate-x-1/2 bg-[#880000]/30" style={{ animationDelay: "-12s" }} />
          <div className="kai-scanlines absolute inset-0 opacity-20" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "cosmic-nebula":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-background" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-[15%] h-[65vh] w-[60vw] bg-[#8a2be2]/20" />
          <div className="animate-bloom kai-bloom absolute -top-[25vh] right-[15%] h-[65vh] w-[60vw] bg-[#00f0ff]/16" style={{ animationDelay: "-9s" }} />
          <div className="animate-bloom kai-bloom absolute top-[25vh] left-1/2 h-[50vh] w-[70vw] -translate-x-1/2 bg-[#3b0066]/25" style={{ animationDelay: "-16s" }} />
          <div className="kai-scanlines absolute inset-0 opacity-20" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "tactical-radar":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-background" />
          <div className="absolute inset-0 bg-[radial-gradient(#00ff8812_1px,transparent_1px)] bg-[size:36px_36px]" />
          <div className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 size-[500px] rounded-full border border-[#00ff8815] bg-[radial-gradient(circle,#00ff8808_0%,transparent_70%)]" />
          <div className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 size-[280px] rounded-full border border-[#00ff8820]" />
          <div className="animate-bloom kai-bloom absolute -top-[25vh] left-1/2 h-[60vh] w-[70vw] -translate-x-1/2 bg-[#00ff88]/12" />
          <div className="kai-scanlines absolute inset-0 opacity-25" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "neon-sunset":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-background" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-[20%] h-[65vh] w-[60vw] bg-[#ff007f]/22" />
          <div className="animate-bloom kai-bloom absolute -top-[25vh] right-[20%] h-[65vh] w-[60vw] bg-[#ffaa00]/22" style={{ animationDelay: "-8s" }} />
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_40%,#ff007f10_80%,#ffaa0015_100%)]" />
          <div className="kai-scanlines absolute inset-0 opacity-20" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "monochrome-glass":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#09090b]" />
          <div className="animate-bloom kai-bloom absolute -top-[35vh] left-1/2 h-[70vh] w-[75vw] -translate-x-1/2 bg-white/[0.08]" />
          <div className="animate-bloom kai-bloom absolute top-[20vh] left-1/2 h-[45vh] w-[55vw] -translate-x-1/2 bg-white/[0.04]" style={{ animationDelay: "-10s" }} />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "perspective-grid":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-background" />
          <div className="absolute inset-0 [perspective:1000px]">
            <div className="absolute inset-0 [transform:rotateX(60deg)_translateY(-10%)] bg-[linear-gradient(to_right,#ff870018_1px,transparent_1px),linear-gradient(to_bottom,#ff870018_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:linear-gradient(to_bottom,transparent_0%,#000_50%,transparent_100%)]" />
          </div>
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-1/2 h-[65vh] w-[75vw] -translate-x-1/2 bg-kai-orange/16" />
          <div className="kai-scanlines absolute inset-0 opacity-20" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "solar-flare":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-background" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-1/2 h-[75vh] w-[80vw] -translate-x-1/2 bg-[#ffaa00]/22" />
          <div className="animate-bloom kai-bloom absolute -top-[15vh] left-1/2 h-[55vh] w-[65vw] -translate-x-1/2 bg-[#ff5500]/18" style={{ animationDelay: "-7s" }} />
          <div className="kai-scanlines absolute inset-0 opacity-20" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "deep-abyss":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#040814]" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-1/2 h-[70vh] w-[75vw] -translate-x-1/2 bg-[#0066ff]/22" />
          <div className="animate-bloom kai-bloom absolute top-[15vh] left-1/2 h-[50vh] w-[60vw] -translate-x-1/2 bg-[#00aaff]/15" style={{ animationDelay: "-9s" }} />
          <div className="kai-scanlines absolute inset-0 opacity-20" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "obsidian-gold":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#0b0a07]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffd7000d_1px,transparent_1px),linear-gradient(to_bottom,#ffd7000d_1px,transparent_1px)] bg-[size:48px_48px]" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-1/2 h-[65vh] w-[70vw] -translate-x-1/2 bg-[#ffd700]/14" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "matrix-rain":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#030d06]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,#00ff6615_1px,transparent_1px)] bg-[size:100%_8px]" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-1/2 h-[65vh] w-[75vw] -translate-x-1/2 bg-[#00ff66]/14" />
          <div className="kai-scanlines absolute inset-0 opacity-30" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "hyperdrive-stars":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-background" />
          <div className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 size-[650px] rounded-full bg-[radial-gradient(circle,#ff870020_0%,#ffaf0010_40%,transparent_70%)]" />
          <div className="animate-bloom kai-bloom absolute -top-[25vh] left-1/2 h-[65vh] w-[80vw] -translate-x-1/2 bg-kai-orange/15" />
          <div className="kai-scanlines absolute inset-0 opacity-20" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "plasma-wave":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-background" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-[10%] h-[70vh] w-[60vw] bg-[#ff00a0]/20" />
          <div className="animate-bloom kai-bloom absolute -top-[25vh] right-[10%] h-[70vh] w-[60vw] bg-[#6600ff]/20" style={{ animationDelay: "-8s" }} />
          <div className="kai-scanlines absolute inset-0 opacity-20" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "quantum-grid":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-background" />
          <div className="absolute inset-0 bg-[radial-gradient(#00ffff15_1.2px,transparent_1.2px)] bg-[size:28px_28px]" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-1/2 h-[65vh] w-[75vw] -translate-x-1/2 bg-[#00ff99]/14" />
          <div className="kai-scanlines absolute inset-0 opacity-20" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "dark-vapor":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#070708]" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-1/2 h-[75vh] w-[80vw] -translate-x-1/2 bg-white/[0.05]" />
          <div className="kai-scanlines absolute inset-0 opacity-15" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "particle-waves":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#04060a]" />
          <div className="absolute inset-0 bg-[radial-gradient(#00d78718_1.5px,transparent_1.5px)] bg-[size:24px_24px]" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-1/2 h-[70vh] w-[80vw] -translate-x-1/2 bg-[#00d787]/15" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "fluid-silk":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#08030c]" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-[20%] h-[75vh] w-[65vw] bg-[#a855f7]/22" />
          <div className="animate-bloom kai-bloom absolute -top-[25vh] right-[20%] h-[75vh] w-[65vw] bg-[#ec4899]/18" style={{ animationDelay: "-8s" }} />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "hyperspeed-warp":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#020205]" />
          <div className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 size-[700px] rounded-full bg-[radial-gradient(circle,#38bdf825_0%,#818cf812_45%,transparent_70%)]" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-1/2 h-[75vh] w-[85vw] -translate-x-1/2 bg-[#38bdf8]/16" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "liquid-chrome":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#07080a]" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-[25%] h-[65vh] w-[60vw] bg-[#94a3b8]/20" />
          <div className="animate-bloom kai-bloom absolute -top-[25vh] right-[25%] h-[65vh] w-[60vw] bg-[#cbd5e1]/15" style={{ animationDelay: "-9s" }} />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "gravity-ballpit":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#08050e]" />
          <div className="animate-bloom kai-bloom absolute -top-[25vh] left-[15%] h-[60vh] w-[50vw] bg-[#c084fc]/18" />
          <div className="animate-bloom kai-bloom absolute -top-[20vh] right-[15%] h-[60vh] w-[50vw] bg-[#f472b6]/16" style={{ animationDelay: "-7s" }} />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "wave-threads":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#03090d]" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-1/2 h-[70vh] w-[80vw] -translate-x-1/2 bg-[#22d3ee]/18" />
          <div className="kai-scanlines absolute inset-0 opacity-20" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "borealis-curtain":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#020b0b]" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-[15%] h-[75vh] w-[65vw] bg-[#10b981]/22" />
          <div className="animate-bloom kai-bloom absolute -top-[25vh] right-[15%] h-[75vh] w-[65vw] bg-[#06b6d4]/18" style={{ animationDelay: "-8s" }} />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "grid-motion":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#050608]" />
          <div className="absolute inset-0 [perspective:800px]">
            <div className="absolute inset-0 [transform:rotateX(55deg)_translateY(-15%)] bg-[linear-gradient(to_right,#38bdf818_1px,transparent_1px),linear-gradient(to_bottom,#38bdf818_1px,transparent_1px)] bg-[size:45px_45px] [mask-image:linear-gradient(to_bottom,transparent_0%,#000_50%,transparent_100%)]" />
          </div>
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-1/2 h-[70vh] w-[80vw] -translate-x-1/2 bg-[#38bdf8]/15" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "letter-glitch":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#030905]" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-1/2 h-[70vh] w-[80vw] -translate-x-1/2 bg-[#4ade80]/16" />
          <div className="kai-scanlines absolute inset-0 opacity-30" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "star-network":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#030712]" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-1/2 h-[70vh] w-[80vw] -translate-x-1/2 bg-[#6366f1]/18" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "light-beams":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#08080a]" />
          <div className="animate-bloom kai-bloom absolute -top-[35vh] left-1/2 h-[80vh] w-[85vw] -translate-x-1/2 bg-white/[0.09]" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "perlin-noise":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#080808]" />
          <div className="kai-scanlines absolute inset-0 opacity-25" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "organic-liquid":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#06040a]" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-[20%] h-[75vh] w-[65vw] bg-[#8b5cf6]/20" />
          <div className="animate-bloom kai-bloom absolute -top-[25vh] right-[20%] h-[75vh] w-[65vw] bg-[#d946ef]/18" style={{ animationDelay: "-8s" }} />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "iridescent-mesh":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#05070a]" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-[20%] h-[70vh] w-[60vw] bg-[#06b6d4]/16" />
          <div className="animate-bloom kai-bloom absolute -top-[25vh] right-[20%] h-[70vh] w-[60vw] bg-[#f43f5e]/15" style={{ animationDelay: "-9s" }} />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "geometric-poly":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#07090e]" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-1/2 h-[70vh] w-[80vw] -translate-x-1/2 bg-[#38bdf8]/15" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "decayed-crt":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#080a06]" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-1/2 h-[70vh] w-[80vw] -translate-x-1/2 bg-[#84cc16]/15" />
          <div className="kai-scanlines absolute inset-0 opacity-45" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "steel-weave":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#090b0e]" />
          <div className="absolute inset-0 bg-[linear-gradient(45deg,#ffffff0a_1px,transparent_1px),linear-gradient(-45deg,#ffffff0a_1px,transparent_1px)] bg-[size:30px_30px]" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "prism-refract":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#050608]" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-[15%] h-[65vh] w-[55vw] bg-[#38bdf8]/16" />
          <div className="animate-bloom kai-bloom absolute -top-[25vh] right-[15%] h-[65vh] w-[55vw] bg-[#f43f5e]/16" style={{ animationDelay: "-7s" }} />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "pulse-spectrum":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#060408]" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-1/2 h-[70vh] w-[80vw] -translate-x-1/2 bg-[#a855f7]/18" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "orbital-ring":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#03060a]" />
          <div className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 size-[580px] rounded-full border border-[#38bdf820] bg-[radial-gradient(circle,#38bdf810_0%,transparent_70%)]" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-1/2 h-[70vh] w-[80vw] -translate-x-1/2 bg-[#38bdf8]/15" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "synth-horizon":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#0b030e]" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-1/2 h-[70vh] w-[80vw] -translate-x-1/2 bg-[#d946ef]/22" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "neon-skyline":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#08020a]" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-[20%] h-[70vh] w-[60vw] bg-[#06b6d4]/20" />
          <div className="animate-bloom kai-bloom absolute -top-[25vh] right-[20%] h-[70vh] w-[60vw] bg-[#f43f5e]/20" style={{ animationDelay: "-8s" }} />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "vapor-dream":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#0c0512]" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-[20%] h-[70vh] w-[60vw] bg-[#c084fc]/20" />
          <div className="animate-bloom kai-bloom absolute -top-[25vh] right-[20%] h-[70vh] w-[60vw] bg-[#38bdf8]/18" style={{ animationDelay: "-8s" }} />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "hex-scanner":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#04080a]" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-1/2 h-[70vh] w-[80vw] -translate-x-1/2 bg-[#06b6d4]/16" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "holo-reticle":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#04080d]" />
          <div className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 size-[500px] rounded-full border border-[#00f0ff20]" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-1/2 h-[70vh] w-[80vw] -translate-x-1/2 bg-[#00f0ff]/16" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "sea-biolum":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#020b0f]" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-1/2 h-[70vh] w-[80vw] -translate-x-1/2 bg-[#0d9488]/18" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "solar-coronal":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#0d0402]" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-1/2 h-[75vh] w-[85vw] -translate-x-1/2 bg-[#f97316]/22" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "binary-waterfall":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#020a04]" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-1/2 h-[70vh] w-[80vw] -translate-x-1/2 bg-[#22c55e]/18" />
          <div className="kai-scanlines absolute inset-0 opacity-30" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "quantum-tunnel":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#03060c]" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-1/2 h-[70vh] w-[80vw] -translate-x-1/2 bg-[#6366f1]/18" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "dark-lensing":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#030305]" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-1/2 h-[70vh] w-[80vw] -translate-x-1/2 bg-[#475569]/15" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "carbon-alloy":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#08080a]" />
          <div className="absolute inset-0 bg-[linear-gradient(45deg,#ffffff0d_1px,transparent_1px),linear-gradient(-45deg,#ffffff0d_1px,transparent_1px)] bg-[size:24px_24px]" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "celestial-stars":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#03050c]" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-1/2 h-[75vh] w-[85vw] -translate-x-1/2 bg-[#818cf8]/18" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "volcanic-embers":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#0c0302]" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-1/2 h-[75vh] w-[85vw] -translate-x-1/2 bg-[#ef4444]/22" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "ice-crystals":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#05090e]" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-1/2 h-[70vh] w-[80vw] -translate-x-1/2 bg-[#0ea5e9]/18" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "emerald-cipher":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#020a06]" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-1/2 h-[70vh] w-[80vw] -translate-x-1/2 bg-[#10b981]/18" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "sapphire-velvet":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#030612]" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-1/2 h-[75vh] w-[85vw] -translate-x-1/2 bg-[#2563eb]/22" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "golden-sunrise":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#0b0803]" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-1/2 h-[75vh] w-[85vw] -translate-x-1/2 bg-[#eab308]/20" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "global-cybernet":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#04080e]" />
          <div className="animate-bloom kai-bloom absolute -top-[30vh] left-1/2 h-[70vh] w-[80vw] -translate-x-1/2 bg-[#0284c7]/18" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "monolith-flare":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#070709]" />
          <div className="animate-bloom kai-bloom absolute -top-[35vh] left-1/2 h-[80vh] w-[65vw] -translate-x-1/2 bg-[#f97316]/18" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    case "master-kaioken-100":
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#0d0101]" />
          <div className="animate-bloom kai-bloom absolute -top-[25vh] left-[15%] h-[80vh] w-[70vw] bg-[#dc2626]/28" />
          <div className="animate-bloom kai-bloom absolute -top-[20vh] right-[15%] h-[80vh] w-[70vw] bg-[#ea580c]/25" style={{ animationDelay: "-7s" }} />
          <div className="kai-scanlines absolute inset-0 opacity-25" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )

    default: {
      // Dynamic thematic generator fallback so every single variant (1 to 100) has a rich, unique background
      const option = VARIANTS.find((v) => v.id === variant)
      const num = option?.num || 1
      const hue = (num * 37) % 360
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute inset-0 bg-[#08080a]" />
          <div
            className="animate-bloom kai-bloom absolute -top-[30vh] left-1/2 h-[75vh] w-[80vw] -translate-x-1/2"
            style={{ backgroundColor: `hsla(${hue}, 85%, 55%, 0.16)` }}
          />
          <div
            className="animate-bloom kai-bloom absolute top-[20vh] left-[20%] h-[50vh] w-[50vw]"
            style={{ backgroundColor: `hsla(${(hue + 60) % 360}, 80%, 50%, 0.12)`, animationDelay: "-8s" }}
          />
          <div className="kai-scanlines absolute inset-0 opacity-20" />
          <div className="kai-vignette absolute inset-0" />
        </div>
      )
    }
  }
}
