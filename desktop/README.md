# Kaioken Desktop Studio

Fresh, modern **Electron** desktop studio foundation for Kaioken, engineered from zero with **Electron 44**, **TypeScript**, **electron-vite 5**, and **React 19**.

---

## ⚡ Quick Start

### In Development (with live HMR)
From repo root:
```bash
npm run desktop:dev
```
Or directly inside `desktop/`:
```bash
npm run dev
```

### Build for Production
```bash
npm run desktop:build
```

### Preview Production Build Locally
```bash
cd desktop
npm run preview
```

### Type Checking
```bash
npm run typecheck
```

---

## 🏗️ Architecture

```
desktop/
├── electron.vite.config.ts        # electron-vite multi-target bundler configuration
├── electron-builder.json5         # Packaging & installer configuration
├── package.json                   # Dependencies & build scripts
├── tsconfig.json                  # Root TypeScript reference config
├── tsconfig.node.json             # Main & Preload TypeScript config
├── tsconfig.web.json              # Renderer React 19 TypeScript config
├── resources/                     # App icons and packaging resources
│   └── icon.png
└── src/
    ├── main/                      # Electron Main Process (Node.js runtime)
    │   ├── index.ts               # App lifecycle, frameless window, security policy
    │   └── ipc/                   # Modular IPC handlers
    │       ├── index.ts           # IPC registry
    │       ├── window.ts          # Window minimize, maximize, restore, close
    │       └── studio.ts          # Studio diagnostics, system info, ping
    ├── preload/                   # Preload Scripts (Isolated bridge)
    │   ├── index.ts               # contextBridge exposure (window.api)
    │   └── index.d.ts             # TypeScript definitions for window.api
    └── renderer/                  # Renderer Process (React 19 + Vite)
        ├── index.html             # HTML entry point with security CSP
        └── src/
            ├── main.tsx           # React entry point
            ├── App.tsx            # Desktop Studio shell & canvas
            ├── index.css          # Glassmorphic dark cyber design system
            ├── assets/            # Studio brand assets
            ├── components/        # UI components
            │   ├── TitleBar.tsx   # Custom frameless title bar with drag region
            │   ├── StudioHeader.tsx # Studio branding & live engine status
            │   ├── DiagnosticsCard.tsx # Real-time IPC ping and system specs
            │   └── StarterGrid.tsx # Architectural modules ready to build from zero
            └── types/             # Frontend type definitions
```

---

## 🔐 Security Best Practices Configured

- **Context Isolation Enabled**: `contextIsolation: true`
- **Node Integration Disabled in Renderer**: `nodeIntegration: false`
- **Safe Sandboxed IPC**: All renderer-to-main communication is gated through explicit `contextBridge` APIs in `src/preload/index.ts`.
- **Navigation Lock**: External links are securely intercepted and routed to the default OS browser via `shell.openExternal`.
- **Content Security Policy (CSP)**: Strict script and origin restrictions configured in `index.html`.

---

## 🚀 Building Modules From Zero

To build your studio features:
1. **Add IPC Channels**: Define handlers in `src/main/ipc/` and register them in `src/main/ipc/index.ts`.
2. **Expose Typed Methods**: Add typed wrappers in `src/preload/index.ts` and define their signatures in `src/preload/index.d.ts`.
3. **Build Views & Panels**: Create your React components in `src/renderer/src/` and import them into `App.tsx` or set up router views.
