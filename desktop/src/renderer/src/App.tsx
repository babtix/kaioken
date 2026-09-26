import React from 'react'
import { Construction } from 'lucide-react'
import { TitleBar } from './components/TitleBar'
import { StudioHeader } from './components/StudioHeader'
import { DiagnosticsCard } from './components/DiagnosticsCard'
import { StarterGrid } from './components/StarterGrid'

export const App: React.FC = () => {
  return (
    <>
      <TitleBar />
      <main className="studio-layout">
        <div className="studio-content">
          <StudioHeader />

          <div
            style={{
              padding: '12px 18px',
              borderRadius: '8px',
              background: 'linear-gradient(90deg, rgba(245, 158, 11, 0.12), rgba(255, 51, 102, 0.08))',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              fontSize: '12px'
            }}
          >
            <Construction size={18} color="#f59e0b" style={{ flexShrink: 0 }} />
            <div>
              <span style={{ fontWeight: 600, color: '#f59e0b', letterSpacing: '0.02em' }}>
                KAIOKEN 2.0 TRANSITION:
              </span>{' '}
              <span style={{ color: 'var(--text-muted)' }}>
                Desktop Studio has officially switched from Tauri to <strong>Electron</strong> for Kaioken 2. The multi-process engine, diff reviewer, and AST knowledge surfaces are currently <strong>under active construction &amp; development</strong>.
              </span>
            </div>
          </div>

          <DiagnosticsCard />
          <StarterGrid />

          <footer
            style={{
              paddingTop: '20px',
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '11px',
              color: 'var(--text-dim)',
              flexWrap: 'wrap',
              gap: '12px'
            }}
          >
            <div>Kaioken 2 Desktop Studio · Electron Multi-Process · Under Active Construction</div>
            <div style={{ display: 'flex', gap: '16px' }}>
              <span>
                <kbd style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 5px', borderRadius: '3px', border: '1px solid var(--border-subtle)' }}>F12</kbd> DevTools
              </span>
              <span>
                <kbd style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 5px', borderRadius: '3px', border: '1px solid var(--border-subtle)' }}>Ctrl+Shift+I</kbd> Inspect
              </span>
            </div>
          </footer>
        </div>
      </main>
    </>
  )
}
