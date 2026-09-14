import React from 'react';

export const KaiokenPowerCore: React.FC = () => {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: '680px',
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Kaioken AST Power Reactor Core SVG (De-glowed, Pure Hairline Astrolabe) */}
      <svg
        viewBox="0 0 600 600"
        width="100%"
        height="100%"
        style={{
          maxWidth: '540px',
          height: 'auto',
        }}
        aria-label="Kaioken Power Reactor Core"
      >
        <defs>
          {/* Radial Path for Orbiting Text */}
          <path
            id="textOrbit1"
            d="M 300, 300 m -220, 0 a 220,220 0 1,1 440,0 a 220,220 0 1,1 -440,0"
            fill="none"
          />
          <path
            id="textOrbit2"
            d="M 300, 300 m -165, 0 a 165,165 0 1,1 330,0 a 165,165 0 1,1 -330,0"
            fill="none"
          />
        </defs>

        {/* Outer Fine Woodcut Radiating Lines (36 Rays) */}
        <g stroke="#ff1e00" strokeWidth="1" opacity="0.45">
          {Array.from({ length: 36 }).map((_, i) => {
            const angle = (i * 10 * Math.PI) / 180;
            const x1 = 300 + Math.cos(angle) * 250;
            const y1 = 300 + Math.sin(angle) * 250;
            const x2 = 300 + Math.cos(angle) * 290;
            const y2 = 300 + Math.sin(angle) * 290;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
          })}
        </g>

        {/* Secondary Radiating Burst Rays (72 Fine Lines) */}
        <g stroke="#ff8700" strokeWidth="0.8" opacity="0.3">
          {Array.from({ length: 72 }).map((_, i) => {
            const angle = (i * 5 * Math.PI) / 180;
            const x1 = 300 + Math.cos(angle) * 230;
            const y1 = 300 + Math.sin(angle) * 230;
            const x2 = 300 + Math.cos(angle) * (i % 2 === 0 ? 275 : 260);
            const y2 = 300 + Math.sin(angle) * (i % 2 === 0 ? 275 : 260);
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
          })}
        </g>

        {/* Concentric Outer Ring */}
        <circle cx="300" cy="300" r="248" fill="none" stroke="#ff8700" strokeWidth="1.5" opacity="0.6" />
        <circle cx="300" cy="300" r="242" fill="none" stroke="#ff1e00" strokeWidth="1" strokeDasharray="6 4" opacity="0.7" />

        {/* Orbiting Text Track 1 */}
        <text fill="#ffffff" fontSize="10" fontFamily="'JetBrains Mono', monospace" letterSpacing="4px" opacity="0.75">
          <textPath href="#textOrbit1">
            KAIOKEN REPOSITORY KNOWLEDGE ENGINE • DETERMINISTIC AST INDEX • ZERO ROT • HARD GROUNDING GATE •
          </textPath>
        </text>

        {/* Middle Dial Ring with Tick Marks */}
        <circle cx="300" cy="300" r="195" fill="none" stroke="#ffffff" strokeWidth="1" opacity="0.5" />
        <circle cx="300" cy="300" r="185" fill="none" stroke="#ff8700" strokeWidth="2" opacity="0.8" />
        <circle cx="300" cy="300" r="175" fill="none" stroke="#ff1e00" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />

        {/* Orbiting Text Track 2 */}
        <text fill="#ff8700" fontSize="9" fontFamily="'JetBrains Mono', monospace" letterSpacing="3px" opacity="0.85">
          <textPath href="#textOrbit2">
            MULTIPLIER ×10 • SYMBOL ORACLE • BM25 INDEX • TREE-SITTER SCANNER • SHA-256 PROVENANCE •
          </textPath>
        </text>

        {/* Geometrical Hexagon / Astrolabe Lattice */}
        <polygon
          points="300,165 416,232 416,367 300,435 184,367 184,232"
          fill="none"
          stroke="#ff8700"
          strokeWidth="1.2"
          opacity="0.6"
        />
        <polygon
          points="300,175 408,237 408,362 300,425 192,362 192,237"
          fill="none"
          stroke="#ff1e00"
          strokeWidth="1"
          opacity="0.5"
          transform="rotate(30 300 300)"
        />

        {/* Center Structural Rings (Flat Hairlines, No Glow) */}
        <circle cx="300" cy="300" r="120" fill="none" stroke="#ff1e00" strokeWidth="1" opacity="0.35" />
        <circle cx="300" cy="300" r="95" fill="#08080a" stroke="#ff8700" strokeWidth="2" />
        <circle cx="300" cy="300" r="88" fill="none" stroke="#ff1e00" strokeWidth="1.5" strokeDasharray="4 4" />

        {/* Authentic Japanese Kanji Emblem "界王" (Kaio / King Kai) */}
        <g textAnchor="middle" dominantBaseline="central">
          <text
            x="300"
            y="278"
            fontSize="54"
            fontFamily="'Bodoni Moda', Didot, serif"
            fontWeight="900"
            fill="#ffffff"
          >
            界
          </text>
          <text
            x="300"
            y="328"
            fontSize="54"
            fontFamily="'Bodoni Moda', Didot, serif"
            fontWeight="900"
            fill="#ff8700"
          >
            王
          </text>
        </g>

        {/* Power Core Cardinal Nodes */}
        <circle cx="300" cy="195" r="4" fill="#ffffff" stroke="#ff1e00" strokeWidth="2" />
        <circle cx="300" cy="405" r="4" fill="#ffffff" stroke="#ff1e00" strokeWidth="2" />
        <circle cx="195" cy="300" r="4" fill="#ffffff" stroke="#ff8700" strokeWidth="2" />
        <circle cx="405" cy="300" r="4" fill="#ffffff" stroke="#ff8700" strokeWidth="2" />
      </svg>
    </div>
  );
};
