import { Component } from 'react'

// last line of defence, so a render bug shows a message instead of a blank page
class ErrorBoundary extends Component {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error(error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div style={{ maxWidth: 420, margin: '20vh auto', padding: '0 16px' }}>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>Something broke</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>
          Sorry about that. Reloading the page usually helps.
        </p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    )
  }
}

export default ErrorBoundary
