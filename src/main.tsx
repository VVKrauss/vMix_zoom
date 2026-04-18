import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@flaticon/flaticon-uicons/css/regular/rounded.css'
import './index.css'
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
