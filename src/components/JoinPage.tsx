import { useState, FormEvent, useMemo } from 'react'
import type { JoinRoomMediaOptions } from '../hooks/useRoom'
import type { VideoPreset } from '../types'
import { VIDEO_PRESETS } from '../types'
import { getStoredVideoPreset, persistVideoPreset } from '../config/roomUiStorage'
import { MicIcon, MicOffIcon, CamIcon, CamOffIcon, ChevronLeftIcon } from './icons'
import { useAuth } from '../context/AuthContext'
import type { SpaceRoomChatVisibility, SpaceRoomCreateOptions } from '../lib/spaceRoom'
import { SPACE_ROOM_HOST_CREATE_CHAT_OPTIONS } from '../lib/spaceRoom'

/** Подписи уровня качества при создании комнаты (индексы = `VIDEO_PRESETS`). */
const HOST_CREATE_VIDEO_QUALITY_LABELS = ['Низкое', 'Среднее', 'Хорошее', 'Лучшее'] as const

interface Props {
  roomId: string
  /** Создание комнаты хостом: на этом экране выбираем качество и чат (тип комнаты — пока только временная). */
  hostCreateFlow?: boolean
  onJoin: (
    name: string,
    roomId: string,
    preset: VideoPreset,
    media: JoinRoomMediaOptions,
    hostCreateOptions?: SpaceRoomCreateOptions,
  ) => void | Promise<void>
  onBackToHome: () => void
  error: string | null
}

function presetIndexFromStored(): number {
  const p = getStoredVideoPreset()
  const i = VIDEO_PRESETS.findIndex(
    (x) =>
      x.width === p.width &&
      x.height === p.height &&
      x.maxBitrate === p.maxBitrate &&
      x.frameRate === p.frameRate,
  )
  return i >= 0 ? i : 1
}

export function JoinPage({ roomId, hostCreateFlow = false, onJoin, onBackToHome, error }: Props) {
  const { user } = useAuth()

  const profileName = user?.user_metadata?.display_name as string | undefined
    ?? user?.email?.split('@')[0]
    ?? ''

  const [guestName, setGuestName] = useState('')
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [videoPresetIndex, setVideoPresetIndex] = useState(presetIndexFromStored)
  const [chatVisibility, setChatVisibility] = useState<SpaceRoomChatVisibility>('everyone')

  const isAuthed = !!user
  const name = isAuthed ? profileName : guestName

  const selectedPreset = useMemo(
    () => VIDEO_PRESETS[videoPresetIndex] ?? getStoredVideoPreset(),
    [videoPresetIndex],
  )

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const rid = roomId.trim()
    if (!name.trim() || !rid) return
    persistVideoPreset(selectedPreset)
    const hostCreateOptions: SpaceRoomCreateOptions | undefined = hostCreateFlow
      ? { lifecycle: 'temporary', chatVisibility }
      : undefined
    void onJoin(name.trim(), rid, selectedPreset, { enableMic: micOn, enableCam: camOn }, hostCreateOptions)
  }

  const goMain = () => {
    setGuestName('')
    onBackToHome()
  }

  return (
    <div className="join-screen">
      <div className={`join-card${hostCreateFlow ? ' join-card--host-create' : ''}`}>
        {hostCreateFlow ? (
          <div className="join-host-create__head">
            <button
              type="button"
              className="join-back-arrow"
              onClick={onBackToHome}
              title="Назад"
              aria-label="Назад"
            >
              <ChevronLeftIcon />
            </button>
            <button type="button" className="join-logo-btn" onClick={goMain} title="Главная" aria-label="Главная">
              <img className="brand-logo brand-logo--join-h" src="/logo-h.png" alt="" draggable={false} />
            </button>
            <span className="join-host-create__head-slot" aria-hidden />
          </div>
        ) : (
          <button type="button" className="join-logo-btn" onClick={goMain} title="Главная" aria-label="Главная">
            <img className="brand-logo brand-logo--join-h" src="/logo-h.png" alt="" draggable={false} />
          </button>
        )}

        <form onSubmit={handleSubmit} className="join-form">
          <label className="join-label">Ваше имя</label>
          {isAuthed ? (
            <div className="join-name-authed">
              <span className="join-name-authed__name">{profileName}</span>
            </div>
          ) : (
            <input
              className="join-input"
              type="text"
              placeholder="Введите имя"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              autoFocus
              maxLength={40}
            />
          )}

          <label className="join-label" id="join-media-label">
            Микрофон и камера
          </label>
          <div
            className="join-media-toggles"
            role="group"
            aria-labelledby="join-media-label"
          >
            <button
              type="button"
              className={`join-media-toggle${micOn ? ' join-media-toggle--on' : ' join-media-toggle--off'}`}
              aria-pressed={micOn}
              title={micOn ? 'Микрофон включён — нажмите, чтобы выключить' : 'Микрофон выключен — нажмите, чтобы включить'}
              onClick={() => setMicOn((v) => !v)}
            >
              <span className="join-media-toggle__icon">{micOn ? <MicIcon /> : <MicOffIcon />}</span>
              <span className="join-media-toggle__text">Микрофон</span>
            </button>
            <button
              type="button"
              className={`join-media-toggle${camOn ? ' join-media-toggle--on' : ' join-media-toggle--off'}`}
              aria-pressed={camOn}
              title={camOn ? 'Камера включена — нажмите, чтобы выключить' : 'Камера выключена — нажмите, чтобы включить'}
              onClick={() => setCamOn((v) => !v)}
            >
              <span className="join-media-toggle__icon">{camOn ? <CamIcon /> : <CamOffIcon />}</span>
              <span className="join-media-toggle__text">Камера</span>
            </button>
          </div>

          {hostCreateFlow ? (
            <>
              <label className="join-label" htmlFor="join-video-preset">
                Качество видео
              </label>
              <select
                id="join-video-preset"
                className="create-room-options__select join-host-create__select"
                value={videoPresetIndex}
                onChange={(e) => setVideoPresetIndex(Number.parseInt(e.target.value, 10) || 0)}
                aria-label="Качество видео при входе"
              >
                {VIDEO_PRESETS.map((p, idx) => (
                  <option key={`${p.width}x${p.height}-${p.maxBitrate}`} value={idx}>
                    {HOST_CREATE_VIDEO_QUALITY_LABELS[idx] ?? p.label}
                  </option>
                ))}
              </select>

              <div className="join-host-create__fieldset">
                <span className="join-label">Чат при старте</span>
                <p className="create-room-options__note join-host-create__note">
                  Хост может изменить режим чата во время встречи.
                </p>
                <select
                  className="create-room-options__select join-host-create__select"
                  value={chatVisibility}
                  onChange={(e) => setChatVisibility(e.target.value as SpaceRoomChatVisibility)}
                  aria-label="Режим чата при создании"
                >
                  {SPACE_ROOM_HOST_CREATE_CHAT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label} — {o.hint}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : null}

          <button
            className="join-btn join-btn--block"
            type="submit"
            disabled={!name.trim() || !roomId.trim()}
          >
            {hostCreateFlow ? 'Создать и войти' : 'Войти'}
          </button>
        </form>

        {error && <p className="join-error">{error}</p>}
      </div>
    </div>
  )
}
