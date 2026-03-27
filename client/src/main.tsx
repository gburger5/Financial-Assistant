import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './styles/global.css'
import App from './App'

async function bootstrap() {
  // ── Dev mode: intercept all API calls with mock data ──
  if (import.meta.env.VITE_DEV_MODE === 'true') {
    const { installDevMock } = await import('./services/devMock')
    installDevMock()
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  )
}

bootstrap()