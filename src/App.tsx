import { Suspense, lazy, useMemo } from 'react'
import {
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import { AdminProtectedRoute } from './components/AdminProtectedRoute'
import { ProtectedRoute } from './components/ProtectedRoute'
import { useVisualViewport } from './hooks/useVisualViewport'

function VisualViewportSync() {
  useVisualViewport()
  return null
}

const HomePage = lazy(async () => {
  const mod = await import('./components/HomePage')
  return { default: mod.HomePage }
})

const RoomSession = lazy(async () => {
  const mod = await import('./components/RoomSession')
  return { default: mod.RoomSession }
})

const SoloViewerPage = lazy(async () => {
  const mod = await import('./components/SoloViewerPage')
  return { default: mod.SoloViewerPage }
})

const LoginPage = lazy(async () => {
  const mod = await import('./components/LoginPage')
  return { default: mod.LoginPage }
})

const DashboardPage = lazy(async () => {
  const mod = await import('./components/DashboardPage')
  return { default: mod.DashboardPage }
})

const DashboardChatsPage = lazy(async () => {
  const mod = await import('./components/DashboardChatsPage')
  return { default: mod.DashboardChatsPage }
})

const DashboardContactsPage = lazy(async () => {
  const mod = await import('./components/DashboardContactsPage')
  return { default: mod.DashboardContactsPage }
})

const DashboardMessengerPage = lazy(async () => {
  const mod = await import('./components/DashboardMessengerPage')
  return { default: mod.DashboardMessengerPage }
})

const DashboardChatViewPage = lazy(async () => {
  const mod = await import('./components/DashboardChatViewPage')
  return { default: mod.DashboardChatViewPage }
})

const AdminPage = lazy(async () => {
  const mod = await import('./components/AdminPage')
  return { default: mod.AdminPage }
})

const RoomClosedPage = lazy(async () => {
  const mod = await import('./components/RoomClosedPage')
  return { default: mod.RoomClosedPage }
})

const EmailConfirmedPage = lazy(async () => {
  const mod = await import('./components/EmailConfirmedPage')
  return { default: mod.EmailConfirmedPage }
})

const NewsPage = lazy(async () => {
  const mod = await import('./components/NewsPage')
  return { default: mod.NewsPage }
})

const PublicUserPage = lazy(async () => {
  const mod = await import('./components/PublicUserPage')
  return { default: mod.PublicUserPage }
})

function RouteLoadingFallback() {
  return (
    <div className="join-screen">
      <div className="auth-loading" aria-label="Загрузка…" />
    </div>
  )
}

function HomeRoute() {
  const [sp] = useSearchParams()
  const room = sp.get('room')?.trim()
  const peer = sp.get('peer')?.trim()
  if (room && peer) {
    return <Navigate to={`/r/${encodeURIComponent(room)}?peer=${encodeURIComponent(peer)}`} replace />
  }
  if (room) {
    return <Navigate to={`/r/${encodeURIComponent(room)}`} replace />
  }
  return <HomePage />
}

function SoloViewerRouteShell({ roomId, watchPeerId }: { roomId: string; watchPeerId: string }) {
  const navigate = useNavigate()
  return (
    <SoloViewerPage
      roomId={roomId}
      watchPeerId={watchPeerId}
      onExit={() => navigate(`/r/${encodeURIComponent(roomId)}`, { replace: true })}
    />
  )
}

function RoomRoute() {
  const { roomId: raw = '' } = useParams<{ roomId: string }>()
  const [sp] = useSearchParams()

  const roomId = useMemo(() => raw.trim(), [raw])
  const peer = sp.get('peer')?.trim()

  if (!roomId) {
    return <Navigate to="/" replace />
  }

  if (peer) {
    return <SoloViewerRouteShell roomId={roomId} watchPeerId={peer} />
  }

  return <RoomSession key={roomId} roomId={roomId} />
}

export function App() {
  return (
    <>
      <VisualViewportSync />
      <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/news" element={<NewsPage />} />
        <Route path="/u/:slug" element={<PublicUserPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/email-confirmed" element={<EmailConfirmedPage />} />
        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/dashboard/chats" element={<ProtectedRoute><DashboardChatsPage /></ProtectedRoute>} />
        <Route path="/dashboard/chats/:conversationId" element={<ProtectedRoute><DashboardChatViewPage /></ProtectedRoute>} />
        <Route path="/dashboard/messenger" element={<ProtectedRoute><DashboardMessengerPage /></ProtectedRoute>} />
        <Route path="/dashboard/messenger/:conversationId" element={<ProtectedRoute><DashboardMessengerPage /></ProtectedRoute>} />
        <Route path="/dashboard/contacts" element={<ProtectedRoute><DashboardContactsPage /></ProtectedRoute>} />
        <Route path="/dashboard/friends" element={<Navigate to="/dashboard/contacts" replace />} />
        <Route path="/admin" element={<AdminProtectedRoute><AdminPage /></AdminProtectedRoute>} />
        <Route path="/room-closed" element={<RoomClosedPage />} />
        <Route path="/r/:roomId" element={<RoomRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
    </>
  )
}
