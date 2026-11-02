import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { NicePromptProvider } from './components/NicePrompt'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NicePromptProvider>
      <App />
    </NicePromptProvider>
  </StrictMode>,
)
