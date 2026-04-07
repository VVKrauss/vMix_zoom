import { useMemo } from 'react'
import { Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { HomePage } from './components/HomePage'
import { RoomSession } from './components/RoomSession'
import { SoloViewerPage } from './components/SoloViewerPage'
import { LoginPage } from './components/LoginPage'
import { DashboardPage } from './components/DashboardPage'
import { ProtectedRoute } from './components/ProtectedRoute'

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
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/r/:roomId" element={<RoomRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
