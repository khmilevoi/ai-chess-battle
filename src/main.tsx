import "@/app/setup"
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { urlAtom } from '@reatom/core'
import App from './App'
import { initGlobalShortcuts } from './app/shortcuts'
import './index.css'

urlAtom.init()
initGlobalShortcuts()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
