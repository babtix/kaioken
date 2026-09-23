import React from 'react'
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
            <div>Kaioken Desktop Studio · Electron Architecture · Build From Zero</div>
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
