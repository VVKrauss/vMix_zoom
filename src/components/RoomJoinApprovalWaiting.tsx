import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getSpaceRoomJoinStatus } from '../lib/spaceRoom'
import { BrandLogoLoader } from './BrandLogoLoader'

interface Props {
  roomId: string
  userId: string | null
  /** Вызывается когда хост одобрил вход — переходим к JoinPage. */
  onApproved: () => void
  onBack: () => void
}

/**
 * Экран ожидания одобрения для комнат с access_mode = 'approval'.
 * Пользователь видит спиннер и статус. Хост получает запрос через
 * Supabase Realtime Broadcast на канале `room-mod:{roomId}`.
 * Одобрение хоста записывается в space_rooms.approved_joiners →
 * postgres_changes срабатывает → этот компонент видит себя в списке → даёт войти.
 */
export function RoomJoinApprovalWaiting({ roomId, userId, onApproved, onBack }: Props) {
  const [status, setStatus] = useState<'pending' | 'denied' | 'checking'>('pending')
  const requestIdRef = useRef(`req-${Math.random().toString(36).slice(2)}`)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // Отправляем запрос хосту через Broadcast + слушаем ответ
  useEffect(() => {
    const slug = roomId.trim()
    if (!slug) return

    const requestId = requestIdRef.current
    const ch = supabase.channel(`room-mod:${slug}`)

    ch.on('broadcast', { event: 'join-request-denied' }, (msg) => {
      const payload = msg.payload as { requestId?: string; userId?: string } | null
      if (
        payload?.requestId === requestId ||
        (userId && payload?.userId === userId)
      ) {
        setStatus('denied')
      }
    })

    ch.subscribe((subStatus) => {
      if (subStatus !== 'SUBSCRIBED') return
      void ch.send({
        type: 'broadcast',
        event: 'join-request',
        payload: {
          requestId,
          userId: userId ?? null,
          displayName: document.title,
        },
      })
    })

    channelRef.current = ch
    return () => {
      void supabase.removeChannel(ch)
      channelRef.current = null
    }
  }, [roomId, userId])

  // Слушаем изменения space_rooms.approved_joiners через postgres_changes
  useEffect(() => {
    if (!userId) return
    const slug = roomId.trim()
    if (!slug) return

    const ch = supabase
      .channel(`room-approval-watch:${slug}:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'space_rooms',
          filter: `slug=eq.${slug}`,
        },
        async () => {
          setStatus('checking')
          const { joinable } = await getSpaceRoomJoinStatus(slug, userId)
          if (joinable) {
            onApproved()
          } else {
            setStatus('pending')
          }
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(ch)
    }
  }, [roomId, userId, onApproved])

  // Повторный опрос каждые 15 секунд как fallback
  useEffect(() => {
    if (!userId || status !== 'pending') return
    const slug = roomId.trim()
    if (!slug) return

    const poll = setInterval(async () => {
      const { joinable } = await getSpaceRoomJoinStatus(slug, userId)
      if (joinable) onApproved()
    }, 15_000)

    return () => clearInterval(poll)
  }, [roomId, userId, status, onApproved])

  if (status === 'denied') {
    return (
      <div className="join-screen">
        <div className="join-card join-card--room-closed">
          <div className="room-closed-loader-wrap">
            <BrandLogoLoader size={56} />
          </div>
          <h1 className="room-closed-title">Запрос отклонён</h1>
          <p className="room-closed-text">
            Организатор отклонил ваш запрос на вход. Свяжитесь с ним напрямую.
          </p>
          <div className="room-closed-actions">
            <button type="button" className="join-btn join-btn--block" onClick={onBack}>
              На главную
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="join-screen">
      <div className="join-card room-approval-waiting">
        <div className="room-approval-waiting__loader">
          <BrandLogoLoader size={56} />
        </div>
        <h1 className="room-approval-waiting__title">Ожидание разрешения</h1>
        <p className="room-approval-waiting__body">
          {status === 'checking'
            ? 'Проверяем разрешение…'
            : 'Ваш запрос на вход отправлен организатору. Как только он одобрит — вы попадёте в комнату.'}
        </p>
        <p className="room-approval-waiting__hint">ID комнаты: {roomId}</p>
        <button
          type="button"
          className="join-btn join-btn--secondary join-btn--block room-approval-waiting__back"
          onClick={onBack}
        >
          Отмена
        </button>
      </div>
    </div>
  )
}
