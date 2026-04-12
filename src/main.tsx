import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@flaticon/flaticon-uicons/css/regular/rounded.css'
import './index.css'
import { App } from './App'
import { AuthProvider } from './context/AuthContext'
import { MessengerUnreadProvider } from './context/MessengerUnreadContext'
import { UserPeekProvider } from './context/UserPeekContext'
import { applyTheme, getStoredTheme } from './config/themeStorage'

applyTheme(getStoredTheme())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <BrowserRouter
    future={{
      v7_startTransition: true,
      v7_relativeSplatPath: true,
    }}
  >
    <AuthProvider>
      <MessengerUnreadProvider>
        <UserPeekProvider>
          <App />
        </UserPeekProvider>
      </MessengerUnreadProvider>
    </AuthProvider>
  </BrowserRouter>,
)
