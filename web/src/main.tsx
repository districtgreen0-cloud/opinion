import { StrictMode, Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { installClickFx } from './lib/fx'
import { reportFatal } from './lib/bootGuard'

installClickFx()

/** A render crash anywhere shows the boot-guard report instead of a black screen. */
class Fatal extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(err: unknown) {
    reportFatal(err)
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Fatal>
      <App />
    </Fatal>
  </StrictMode>,
)
