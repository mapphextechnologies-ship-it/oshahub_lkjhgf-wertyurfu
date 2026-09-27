import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, componentStack: '' };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ error, componentStack: info?.componentStack || '' });
    console.error('[Carwash OS render error]', error, info?.componentStack || '');
  }

  retry = () => this.setState({ error: null, componentStack: '' });

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="cw-crash-view" role="alert">
        <section className="cw-crash-card">
          <img src="/osha-hub-logo-light.svg" alt="OshaHub" />
          <span className="cw-login-kicker">OSHAHUB · CAR WASH</span>
          <h1>This screen needs another try</h1>
          <p>Your saved information is still here. The screen hit a rendering problem; retry it or reload the app to continue.</p>
          <div className="cw-crash-actions">
            <button className="cw-primary" type="button" onClick={this.retry}>Try this screen again</button>
            <button className="cw-secondary" type="button" onClick={() => window.location.reload()}>Reload app</button>
          </div>
          {import.meta.env.DEV && (
            <details className="cw-crash-details">
              <summary>Development diagnostics</summary>
              <pre>{String(this.state.error?.stack || this.state.error)}{this.state.componentStack}</pre>
            </details>
          )}
        </section>
      </main>
    );
  }
}
