import React, { useState, useEffect } from 'react'
import { Activity, Send, CheckCircle2, Layers, Cpu, HardDrive } from 'lucide-react'
import type { SystemInfo, PingResult } from '../types/studio'

export const DiagnosticsCard: React.FC = () => {
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null)
  const [pingResult, setPingResult] = useState<PingResult | null>(null)
  const [isPinging, setIsPinging] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (window.api?.studio) {
      window.api.studio
        .getSystemInfo()
        .then((info) => setSysInfo(info))
        .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)))
    } else {
      setLoadError('Preload API not detected (running outside Electron shell)')
    }
  }, [])

  const handlePing = async (): Promise<void> => {
    if (!window.api?.studio) return
    setIsPinging(true)
    const start = performance.now()
    try {
      const res = await window.api.studio.ping()
      const end = performance.now()
      setPingResult({
        ...res,
        latencyMs: Math.round((end - start) * 100) / 100
      })
    } catch (err) {
      console.error('Ping failed:', err)
    } finally {
      setIsPinging(false)
    }
  }

  return (
    <div className="glass-card highlight" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Activity size={18} color="#ff3366" />
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#ffffff' }}>
            Electron IPC & System Diagnostics
          </h2>
        </div>

        <button
          type="button"
          className="btn-primary"
          onClick={handlePing}
          disabled={isPinging || !window.api?.studio}
          style={{ opacity: !window.api?.studio ? 0.5 : 1 }}
        >
          <Send size={14} />
          <span>{isPinging ? 'Pinging IPC...' : 'Test IPC Roundtrip'}</span>
        </button>
      </div>

      {pingResult && (
        <div
          style={{
            padding: '12px 16px',
            background: 'rgba(0, 242, 254, 0.05)',
            border: '1px solid rgba(0, 242, 254, 0.25)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            animation: 'fadeIn 0.2s ease'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#00f2fe' }}>
            <CheckCircle2 size={16} />
            <span>IPC PONG: {pingResult.message.toUpperCase()}</span>
            <span style={{ color: 'var(--text-dim)' }}>|</span>
            <span style={{ color: 'var(--text-muted)' }}>Status: {pingResult.status}</span>
          </div>
          <div style={{ color: '#10b981', fontWeight: '600' }}>
            {pingResult.latencyMs} ms latency
          </div>
        </div>
      )}

      {loadError && !sysInfo && (
        <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', fontSize: '13px', color: '#f87171' }}>
          {loadError}
        </div>
      )}

      {sysInfo && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
          <div
            style={{
              padding: '14px',
              background: 'rgba(10, 12, 16, 0.6)',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
              <Layers size={14} color="#ff3366" />
              <span>Runtime Engine</span>
            </div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>
              Electron {sysInfo.electronVersion}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
              Node {sysInfo.nodeVersion} · Chrome {sysInfo.chromeVersion}
            </div>
          </div>

          <div
            style={{
              padding: '14px',
              background: 'rgba(10, 12, 16, 0.6)',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
              <Cpu size={14} color="#00f2fe" />
              <span>Processor & Platform</span>
            </div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>
              {sysInfo.platform} ({sysInfo.arch})
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
              {sysInfo.cpuCount} Logical CPU Cores
            </div>
          </div>

          <div
            style={{
              padding: '14px',
              background: 'rgba(10, 12, 16, 0.6)',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
              <HardDrive size={14} color="#10b981" />
              <span>Memory Allocation</span>
            </div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>
              {sysInfo.freeMemoryMB} MB Free
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
              of {sysInfo.totalMemoryMB} MB Total System RAM
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
