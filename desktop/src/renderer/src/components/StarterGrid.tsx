import React from 'react'
import { Terminal, BookOpen, GitCompare, Workflow, ArrowRight, Code2 } from 'lucide-react'

interface StudioModuleCard {
  id: string
  title: string
  subtitle: string
  description: string
  icon: React.ReactNode
  accentColor: string
  targetPath: string
}

const MODULES: StudioModuleCard[] = [
  {
    id: 'terminal',
    title: 'Terminal & Runner',
    subtitle: 'PTY & Sub-agent Session',
    description: 'Embedded terminal execution for running Kaioken CLI, tracking tool calls, and streaming agent turns.',
    icon: <Terminal size={20} color="#ff3366" />,
    accentColor: '#ff3366',
    targetPath: 'src/renderer/src/modules/terminal/'
  },
  {
    id: 'wiki',
    title: 'Architecture & Wiki',
    subtitle: 'Mermaid & Markdown Canvas',
    description: 'Full-bleed reading surface for generated wikis, interactive module diagrams, and knowledge card graphs.',
    icon: <BookOpen size={20} color="#00f2fe" />,
    accentColor: '#00f2fe',
    targetPath: 'src/renderer/src/modules/wiki/'
  },
  {
    id: 'diff',
    title: 'Structured Diff Approver',
    subtitle: 'Side-by-side Patch Inspector',
    description: 'First-class human-in-the-loop review with syntax highlighting, per-hunk approval, and zero-loss undo.',
    icon: <GitCompare size={20} color="#10b981" />,
    accentColor: '#10b981',
    targetPath: 'src/renderer/src/modules/diff/'
  },
  {
    id: 'pipeline',
    title: 'Pipeline & Sessions',
    subtitle: 'State & Model Orchestration',
    description: 'Live pipeline visualizer, token cost meter, model/provider switcher, and YAML plan editor.',
    icon: <Workflow size={20} color="#f59e0b" />,
    accentColor: '#f59e0b',
    targetPath: 'src/renderer/src/modules/pipeline/'
  }
]

export const StarterGrid: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#ffffff' }}>
            Desktop Studio Foundation
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Fresh canvas prepared for zero-to-one studio implementation.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
        {MODULES.map((mod) => (
          <div
            key={mod.id}
            className="glass-card"
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '16px',
              cursor: 'default'
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {mod.icon}
                </div>
                <span
                  style={{
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    color: mod.accentColor,
                    padding: '2px 6px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    borderRadius: '4px',
                    border: '1px solid var(--border-subtle)'
                  }}
                >
                  READY TO BUILD
                </span>
              </div>

              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#ffffff' }}>{mod.title}</h3>
                <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>{mod.subtitle}</div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.5 }}>
                  {mod.description}
                </p>
              </div>
            </div>

            <div
              style={{
                paddingTop: '12px',
                borderTop: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-dim)'
              }}
            >
              <span>{mod.targetPath}</span>
              <ArrowRight size={13} color="var(--text-muted)" />
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: '8px',
          padding: '20px',
          borderRadius: '10px',
          background: 'linear-gradient(135deg, rgba(255, 51, 102, 0.05), rgba(15, 18, 25, 0.8))',
          border: '1px solid rgba(255, 51, 102, 0.2)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '14px'
        }}
      >
        <div style={{ marginTop: '2px' }}>
          <Code2 size={20} color="#ff3366" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#ffffff' }}>
            Developer Fast-Start Guide
          </h4>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            • <strong style={{ color: 'var(--text-main)' }}>Renderer Entry</strong>: Modify <code style={{ fontFamily: 'var(--font-mono)', color: '#00f2fe' }}>src/renderer/src/App.tsx</code> to integrate your studio view, panels, or router.
            <br />
            • <strong style={{ color: 'var(--text-main)' }}>Electron IPC</strong>: Add new backend channels in <code style={{ fontFamily: 'var(--font-mono)', color: '#00f2fe' }}>src/main/ipc/</code> and expose them safely via <code style={{ fontFamily: 'var(--font-mono)', color: '#00f2fe' }}>src/preload/index.ts</code>.
            <br />
            • <strong style={{ color: 'var(--text-main)' }}>Hot Reloading</strong>: Run <code style={{ fontFamily: 'var(--font-mono)', color: '#ff3366' }}>npm run dev</code> for instant HMR in the renderer and auto-restarts on main/preload updates.
          </p>
        </div>
      </div>
    </div>
  )
}
