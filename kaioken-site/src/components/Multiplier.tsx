import React from 'react';

const COLS = ['Multiplier', 'Target Coverage & Verification Depth', 'Mode'];

const TIERS = [
  {
    level: '×1',
    target: 'Public surface, main flow, and high-level section summaries.',
    mode: 'Fast scan',
  },
  {
    level: '×2',
    target: 'Adds detailed subsection documents and architectural flow diagrams.',
    mode: 'Architectural',
  },
  {
    level: '×3',
    target: 'Exhaustive coverage of all declarations and exported symbols.',
    mode: 'Default',
    isDefault: true,
  },
  {
    level: '×4..9',
    target: 'Critique-and-revise loops: scores drafts against rubrics, eliminates padding.',
    mode: 'Rubric loop',
  },
  {
    level: '×10',
    target: 'Adversarial grounding repair: detects and fixes every grounding failure.',
    mode: 'Grounding repair',
  },
];

export const Multiplier: React.FC = () => {
  return (
    <section id="multiplier" className="section">
      <div className="wrap">
        <div className="head">
          <span className="head-num">§04</span>
          <h2 className="head-title">The multiplier</h2>
          <span className="head-note">speed vs. verification depth</span>
        </div>

        <p className="lead prose mx-lead">
          The multiplier is a conscious dial balancing speed, compute cost, and verification depth.
          Every command accepts a multiplier flag setting how wide the search goes and how many
          verification passes are enforced.
        </p>

        <div className="caption caption--left">
          <span className="caption-text">tbl. 01 — multiplier levels</span>
        </div>

        <div className="tw">
          <table className="tbl">
            <thead>
              <tr>
                {COLS.map((c) => (
                  <th key={c} scope="col" className="label">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIERS.map((t, i) => (
                <tr key={t.level}>
                  <td
                    className="c-lv mono"
                    style={{
                      color:
                        i === 0
                          ? 'var(--accent)'
                          : i === 1
                          ? 'color-mix(in srgb, var(--accent) 70%, var(--ember))'
                          : i === 2
                          ? 'var(--accent)'
                          : i === 3
                          ? 'color-mix(in srgb, var(--accent) 30%, var(--ember))'
                          : 'var(--ember)',
                    }}
                  >
                    {t.level}
                  </td>
                  <td className="c-nm" style={{ fontWeight: 400, color: 'var(--fg-2)', lineHeight: 1.5 }}>
                    {t.target}
                  </td>
                  <td className="mono c-tp" style={{ whiteSpace: 'nowrap' }}>
                    {t.isDefault ? (
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 6px',
                          borderRadius: 'var(--r-sm)',
                          background: 'var(--accent-soft)',
                          border: 'var(--hair) solid var(--accent-line)',
                          color: 'var(--accent)',
                          fontSize: 'var(--fs-micro)',
                          letterSpacing: '0.04em',
                          fontWeight: 600,
                        }}
                      >
                        DEFAULT
                      </span>
                    ) : (
                      <span className="mono c-mut">{t.mode}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mx-foot mono">
          Cost scales with the dial and is reported before the run starts. Nothing is hidden.
        </p>
      </div>
    </section>
  );
};
