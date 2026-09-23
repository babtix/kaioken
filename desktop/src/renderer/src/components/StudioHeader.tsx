import React from 'react'
import { ShieldCheck, FolderGit2, Cpu } from 'lucide-react'
import logo from '../assets/logo.png'

export const StudioHeader: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(255, 51, 102, 0.2), rgba(0, 242, 254, 0.08))',
              border: '1px solid rgba(255, 51, 102, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 24px rgba(255, 51, 102, 0.25)',
              overflow: 'hidden',
              padding: '6px'
            }}
          >
            <img src={logo} alt="Kaioken Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontSize: '24px', fontWeight: '700', letterSpacing: '-0.02em', color: '#ffffff' }}>
                Kaioken Desktop Studio
              </h1>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: '600',
                  padding: '3px 8px',
                  borderRadius: '20px',
                  background: 'rgba(0, 242, 254, 0.1)',
                  border: '1px solid rgba(0, 242, 254, 0.3)',
                  color: '#00f2fe'
                }}
              >
                VITE + ELECTRON
              </span>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Fresh native developer workbench for Kaioken engine, diff streaming, and RAG pipelines.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="status-indicator" style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
            <span className="pulse-dot" />
            <span>STUDIO RUNNING</span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              color: 'var(--text-muted)',
              background: 'rgba(255, 255, 255, 0.04)',
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)'
            }}
          >
            <ShieldCheck size={14} color="#10b981" />
            <span>ISOLATED IPC</span>
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '24px',
          padding: '12px 18px',
          background: 'rgba(15, 18, 25, 0.6)',
          borderRadius: '8px',
          border: '1px solid var(--border-subtle)',
          fontSize: '12px',
          color: 'var(--text-muted)',
          flexWrap: 'wrap'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FolderGit2 size={14} color="#ff3366" />
          <span>Root:</span>
          <code style={{ color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>desktop/</code>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Cpu size={14} color="#00f2fe" />
          <span>Architecture:</span>
          <span style={{ color: 'var(--text-main)' }}>Multi-process Context-Isolated Electron</span>
        </div>
      </div>
    </div>
  )
}
