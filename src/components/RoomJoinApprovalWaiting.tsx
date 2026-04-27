import { useEffect, useRef, useState } from 'react'
import { rtChannel, rtRemoveChannel } from '../api/realtimeCompat'
import { getSpaceRoomJoinStatus } from '../lib/spaceRoom'
import { BrandLogoLoader } from './BrandLogoLoader'

interface Props {
  roomId: string
  userId: string | null
  /** Имя, введённое пользователем на JoinPage — показывается хосту в запросе. */
  displayName: string
  /** Вызывается когда хост одобрил вход — авто-подключение. */
  onApproved: () => void
  onBack: () => void
}

/**
 * Экран ожидания одобрения для комнат с access_mode = 'approval'.
 *
 * Поток:
 * 1. Подписываемся на канал room-mod:{slug}.
 * 2. Отправляем broadcast join-request с реальным именем пользователя.
 * 3. Хост видит имя в панели запросов и жмёт «Впустить».
 * 4. Хост отправляет broadcast join-approved с requestId.
 * 5. Мы получаем join-approved → вызываем onApproved() → авто-вход.
 *
 * Для авторизованных пользователей также слушается postgres_changes
 * (обновление approved_joiners в space_rooms) как дополнительный триггер.
 */
export function RoomJoinApprovalWaiting({ roomId, userId, displayName, onApproved, onBack }: Props) {
  const [status, setStatus] = useState<'pending' | 'denied' | 'checking'>('pending')
  const requestIdRef = useRef(`req-${Math.random().toString(36).slice(2)}`)
  const approvedRef = useRef(false)
  // Всегда актуальная версия колбэка — без stale closure в useEffect
  const onApprovedRef = useRef(onApproved)
  onApprovedRef.current = onApproved

  const triggerApproved = useRef(() => {
    if (approvedRef.current) return
    approvedRef.current = true
    onApprovedRef.current()
  }).current

  // Основной канал: send join-request и слушаем join-approved / join-request-denied
  useEffect(() => {
    const slug = roomId.trim()
    if (!slug) return

    const requestId = requestIdRef.current
    const ch = rtChannel(`room-mod:${slug}`)

    ch.on('broadcast', { event: 'join-approved' }, (msg: any) => {
      const payload = msg.payload as { requestId?: string; userId?: string } | null
      const matchById = userId && payload?.userId === userId
      const matchByReq = payload?.requestId === requestId
      if (matchById || matchByReq) {
        triggerApproved()
      }
    })

    ch.on('broadcast', { event: 'join-request-denied' }, (msg: any) => {
      const payload = msg.payload as { requestId?: string; userId?: string } | null
      const matchById = userId && payload?.userId === userId
      const matchByReq = payload?.requestId === requestId
      if (matchById || matchByReq) {
        setStatus('denied')
      }
    })

    ch.subscribe((subStatus: any) => {
      if (subStatus !== 'SUBSCRIBED') return
      void ch.send({
        type: 'broadcast',
        event: 'join-request',
        payload: {
          requestId,
          userId: userId ?? null,
          displayName: displayName.trim() || 'Гость',
        },
      })
    })

    return () => {
      rtRemoveChannel(ch)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, userId, displayName])

  // Fallback-опрос каждые 20 с (только для авторизованных)
  useEffect(() => {
    if (!userId || status !== 'pending') return
    const slug = roomId.trim()
    if (!slug) return

    const poll = setInterval(async () => {
      const { joinable } = await getSpaceRoomJoinStatus(slug, userId)
      if (joinable) triggerApproved()
    }, 20_000)

    return () => clearInterval(poll)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, userId, status])

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
