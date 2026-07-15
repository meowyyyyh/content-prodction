import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// 滚动条渐现/渐隐
let scrollTimer: ReturnType<typeof setTimeout> | null = null
document.addEventListener('scroll', () => {
  document.documentElement.classList.add('is-scrolling')
  if (scrollTimer) clearTimeout(scrollTimer)
  scrollTimer = setTimeout(() => {
    document.documentElement.classList.remove('is-scrolling')
  }, 200)
}, { capture: true, passive: true })

// 错误边界：避免白屏，至少能看到报错
class ErrorBoundary extends Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: any) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, fontFamily: 'monospace', color: '#ef4444', background: '#fff', minHeight: '100vh' }}>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>页面崩溃</h2>
          <pre style={{ fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{this.state.error.message}</pre>
          <pre style={{ fontSize: 11, color: '#999', marginTop: 8, whiteSpace: 'pre-wrap' }}>{this.state.error.stack}</pre>
          <button onClick={() => { this.setState({ error: null }); window.location.reload() }} style={{ marginTop: 16, padding: '8px 16px', background: '#07C160', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>重新加载</button>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
