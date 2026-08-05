import React from 'react'
import ReactDOM from 'react-dom/client'
import { ThemeProvider } from 'next-themes'
import icon from '@/resources/build/icon.png?asset'
import { WindowContextProvider, menuItems } from '@/app/components/window'
import { SettingsProvider } from '@/app/components/settings/SettingsContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import App from './app'

ReactDOM.createRoot(document.getElementById('app') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
        <WindowContextProvider titlebar={{ title: 'electron-react-app', icon, menuItems }}>
          <SettingsProvider>
            <App />
          </SettingsProvider>
        </WindowContextProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
