import "@/app/setup"
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { urlAtom } from '@reatom/core'
import App from './App'
import './index.css'

urlAtom.init()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
