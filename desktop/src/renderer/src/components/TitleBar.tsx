import React, { useEffect, useState } from 'react'
import { Minus, Square, Copy, X, Terminal } from 'lucide-react'

export const TitleBar: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    if (window.api?.window) {
      window.api.window.isMaximized().then(setIsMaximized).catch(() => {})
      const cleanup = window.api.window.onMaximizedChange((maximized) => {
        setIsMaximized(maximized)
      })
      return cleanup
    }
    return undefined
  }, [])

  const handleMinimize = (): void => {
    window.api?.window?.minimize()
  }

  const handleToggleMaximize = (): void => {
    window.api?.window?.toggleMaximize()
  }

  const handleClose = (): void => {
    window.api?.window?.close()
  }

  return (
    <header className="studio-titlebar app-drag-region">
      <div className="titlebar-brand">
        <Terminal size={14} color="#ff3366" />
        <span>KAIOKEN STUDIO</span>
        <span className="brand-badge">ELECTRON</span>
      </div>

      <div className="titlebar-controls no-drag">
        <button
          type="button"
          className="control-btn"
          onClick={handleMinimize}
          title="Minimize"
          aria-label="Minimize"
        >
          <Minus size={13} />
        </button>
        <button
          type="button"
          className="control-btn"
          onClick={handleToggleMaximize}
          title={isMaximized ? 'Restore' : 'Maximize'}
          aria-label={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? <Copy size={11} /> : <Square size={11} />}
        </button>
        <button
          type="button"
          className="control-btn close-btn"
          onClick={handleClose}
          title="Close"
          aria-label="Close"
        >
          <X size={13} />
        </button>
      </div>
    </header>
  )
}
