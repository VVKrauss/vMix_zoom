import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource/montserrat/400.css'
import '@fontsource/montserrat/500.css'
import '@fontsource/montserrat/600.css'
import '@fontsource/montserrat/700.css'
import '@flaticon/flaticon-uicons/css/regular/rounded.css'
import './styles/messenger-kind-tabs.css'
import './styles/room-page.css'
import './index.css'
import './styles/dashboard-page.css'
import './styles/messenger-chat-bubbles.css'
import './styles/messenger-audio-player.css'
import { App } from './App'
import { AuthProvider } from './context/AuthContext'
import { ProfileProvider } from './context/ProfileContext'
import { MessengerUnreadProvider } from './context/MessengerUnreadContext'
import { UserPeekProvider } from './context/UserPeekContext'
import { ToastProvider } from './context/ToastContext'
import { applyTheme, getStoredTheme } from './config/themeStorage'
import { registerPwa } from './pwaRegister'

applyTheme(getStoredTheme())
registerPwa()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <BrowserRouter
    future={{
      v7_startTransition: true,
      v7_relativeSplatPath: true,
    }}
  >
    <ToastProvider>
      <AuthProvider>
        <ProfileProvider>
          <MessengerUnreadProvider>
            <UserPeekProvider>
              <App />
            </UserPeekProvider>
          </MessengerUnreadProvider>
        </ProfileProvider>
      </AuthProvider>
    </ToastProvider>
  </BrowserRouter>,
)
