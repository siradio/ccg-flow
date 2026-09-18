import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './auth/AuthContext.jsx'
import { ThemeProvider } from './theme/ThemeContext.jsx'
import { ConfirmProvider } from './components/ConfirmProvider.jsx'
import { I18nProvider } from './i18n/I18nContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <I18nProvider>
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <ConfirmProvider>
              <App />
            </ConfirmProvider>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </I18nProvider>
  </StrictMode>,
)

// PWA : enregistre le service worker (installation + repli hors-ligne). Silencieux si non supporté.
// Auto-mise à jour : quand un nouveau service worker prend le contrôle (nouveau déploiement), on
// recharge une seule fois la page pour charger le bundle à jour — évite qu'un utilisateur reste sur
// une ancienne version (menus/droits obsolètes) après un déploiement, sans hard-refresh manuel.
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller
  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing || !hadController) return
    refreshing = true
    window.location.reload()
  })
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // Vérifie périodiquement une nouvelle version (l'onglet peut rester ouvert longtemps).
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000)
    }).catch(() => {})
  })
}
