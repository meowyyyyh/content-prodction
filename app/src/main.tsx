import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// 滚动条渐现/渐隐：滚动时显示，0.2 秒无滚动后隐藏
let scrollTimer: ReturnType<typeof setTimeout> | null = null
document.addEventListener('scroll', () => {
  document.documentElement.classList.add('is-scrolling')
  if (scrollTimer) clearTimeout(scrollTimer)
  scrollTimer = setTimeout(() => {
    document.documentElement.classList.remove('is-scrolling')
  }, 200)
}, { capture: true, passive: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
