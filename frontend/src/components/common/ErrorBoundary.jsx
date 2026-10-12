import { Component } from 'react';
import Button from '../ui/Button.jsx';

/** Last line of defence: a render error shows a friendly screen instead of a white page. */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('UI crashed', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="grid min-h-dvh place-items-center bg-bg p-6 text-center text-fg">
        <div>
          <div className="mb-4 text-6xl" aria-hidden="true">
            🚨
          </div>
          <h1 className="text-3xl">Jailbreak! Something broke.</h1>
          <p className="mx-auto mt-3 max-w-md text-muted">
            An unexpected error stopped this page. Reloading usually fixes it.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button onClick={() => window.location.reload()}>Reload</Button>
            <Button variant="outline" onClick={() => this.setState({ error: null })}>
              Try again
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
