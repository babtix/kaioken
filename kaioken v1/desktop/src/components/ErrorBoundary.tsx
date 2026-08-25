import { Component, type ReactNode } from "react"

type Props = { children: ReactNode }
type State = { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("ErrorBoundary caught:", error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
          <p className="font-mono text-sm font-bold text-kai-rose">Something went wrong</p>
          <pre className="max-w-lg overflow-auto rounded border border-kai-rose/40 bg-card p-3 font-mono text-[11px] text-kai-rose">
            {this.state.error.message}
            {"\n\n"}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            className="rounded border border-kai-orange/40 px-3 py-1 font-mono text-xs text-kai-orange"
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
