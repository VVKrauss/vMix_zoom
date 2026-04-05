import { useEffect, useMemo, useRef, useState } from 'react'
import React from 'react'
import { ConfirmDialog } from './ConfirmDialog'
import { ControlsBar } from './ControlsBar'
import { ParticipantCard } from './ParticipantCard'
import { DraggablePip } from './DraggablePip'
import { AudioMeter } from './AudioMeter'
import { useAudioOutputs } from '../hooks/useAudioOutputs'
import { useDevices } from '../hooks/useDevices'
import { VideoInfoOverlay } from './VideoInfoOverlay'
import { SrtCopySurface } from './SrtCopyMenu'
import type { PipPos, PipSize } from './DraggablePip'
import type { RemoteParticipant, SrtSessionInfo, VideoPreset } from '../types'
import { ruParticipantsWord } from '../utils/ruPlural'
import { isLocalScreenTileKey, localScreenTileKey } from '../utils/localScreenTile'
import { LocalScreenShareTile } from './LocalScreenShareTile'
import type { RoomChatMessage, RoomReactionBurst } from '../types/roomComms'
import { pickLatestBurstForPeer } from '../types/roomComms'
import { RoomChatPanel } from './RoomChatPanel'
import { ReactionBurstOverlay } from './ReactionBurstOverlay'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useVideoOrientation } from '../hooks/useVideoOrientation'

export type LayoutMode = 'grid' | 'pip' | 'speaker' | 'meet' | 'filmstrip' | 'strip_v' | 'mosaic'

/** Раскладки с «плитками» (в т.ч. мобильное заполнение и object-fit) */
export function layoutUsesTiledView(mode: LayoutMode): boolean {
  return mode === 'grid' || mode === 'filmstrip' || mode === 'strip_v' || mode === 'mosaic'
}
export type ObjectFit = 'cover' | 'contain'

interface Props {
  name: string
  localStream: MediaStream | null
  participants: Map<string, RemoteParticipant>
  roomId: string
  localPeerId: string
  srtByPeer: Record<string, SrtSessionInfo>
  isMuted: boolean
  isCamOff: boolean
  onToggleMute: () => void
  onToggleCam: () => void
  onLeave: () => void
  onSwitchCamera: (id: string) => void
  onSwitchMic: (id: string) => void
  activePreset: VideoPreset
  onChangePreset: (p: VideoPreset) => void
  localScreenStream: MediaStream | null
  isScreenSharing: boolean
  onToggleScreenShare: () => void
  onStartScreenShare: (surface?: 'monitor' | 'window' | 'browser') => void
  chatMessages: RoomChatMessage[]
  onSendChatMessage: (text: string) => void
  onSendReaction: (emoji: string) => void
  reactionBursts: RoomReactionBurst[]
  chatOpen: boolean
  setChatOpen: (open: boolean) => void
  chatUnreadCount: number
}

export function RoomPage({
  name, localStream, participants,
  roomId, localPeerId, srtByPeer,
  isMuted, isCamOff,
  onToggleMute, onToggleCam, onLeave,
  onSwitchCamera, onSwitchMic,
  activePreset, onChangePreset,
  localScreenStream, isScreenSharing, onToggleScreenShare, onStartScreenShare,
  chatMessages, onSendChatMessage, onSendReaction, reactionBursts,
  chatOpen, setChatOpen, chatUnreadCount,
}: Props) {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [layout, setLayout]       = useState<LayoutMode>(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches ? 'grid' : 'pip',
  )
  const [objectFit, setObjectFit] = useState<ObjectFit>('contain')
  const [showInfo, setShowInfo]   = useState(false)
  const [showMeter, setShowMeter] = useState(true)
  const [sourceAspect, setSourceAspect] = useState<number | null>(null)
  const [pipPos,  setPipPos]  = useState<PipPos> ({ x: 16,  y: 10  })
  const [pipSize, setPipSize] = useState<PipSize>(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
      ? { w: 140, h: 94 }
      : { w: 220, h: 148 },
  )

  const [leaveDialog, setLeaveDialog] = useState<null | { mode: 'home' | 'leave'; others: number }>(null)
  const [screenStopDialogOpen, setScreenStopDialogOpen] = useState(false)
  const [speakerPinnedPeerId, setSpeakerPinnedPeerId] = useState<string | null>(null)

  const { audioOutputs, refreshAudioOutputs } = useAudioOutputs()
  const [playoutVolume, setPlayoutVolume] = useState(() => {
    try {
      const v = localStorage.getItem('vmix_playout_volume')
      if (v == null) return 1
      const n = Number(v)
      return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1
    } catch {
      return 1
    }
  })
  const [playoutSinkId, setPlayoutSinkId] = useState(() => {
    try {
      return localStorage.getItem('vmix_playout_sink') ?? ''
    } catch {
      return ''
    }
  })

  const [showControlButtonLabels, setShowControlButtonLabels] = useState(() => {
    try {
      const v = localStorage.getItem('vmix_control_button_labels')
      if (v === null) return false
      return v === '1' || v === 'true'
    } catch {
      return false
    }
  })

  const [chatEmbed, setChatEmbed] = useState(() => {
    try {
      const v = localStorage.getItem('vmix_chat_embed')
      if (v === null) return true
      return v === '1' || v === 'true'
    } catch {
      return true
    }
  })

  const remoteList = useMemo(() => [...participants.values()], [participants])
  /** Камера + удалённые + отдельная плитка демонстрации */
  const rosterCount = remoteList.length + 1 + (isScreenSharing && localScreenStream ? 1 : 0)

  const mobileSoloTiles =
    isMobile &&
    layoutUsesTiledView(layout) &&
    remoteList.length === 0 &&
    !(isScreenSharing && localScreenStream)

  const mobileMultiTiles = isMobile && layoutUsesTiledView(layout) && !mobileSoloTiles

  const {
    cameras, microphones,
    selectedCameraId, selectedMicId,
    setSelectedCameraId, setSelectedMicId,
    enumerate,
  } = useDevices()

  useEffect(() => { if (localStream) enumerate() }, [localStream, enumerate])

  useEffect(() => {
    try {
      localStorage.setItem('vmix_playout_volume', String(playoutVolume))
    } catch {
      /* noop */
    }
  }, [playoutVolume])

  useEffect(() => {
    try {
      if (playoutSinkId) localStorage.setItem('vmix_playout_sink', playoutSinkId)
    } catch {
      /* noop */
    }
  }, [playoutSinkId])

  useEffect(() => {
    try {
      localStorage.setItem('vmix_control_button_labels', showControlButtonLabels ? '1' : '0')
    } catch {
      /* noop */
    }
  }, [showControlButtonLabels])

  useEffect(() => {
    try {
      localStorage.setItem('vmix_chat_embed', chatEmbed ? '1' : '0')
    } catch {
      /* noop */
    }
  }, [chatEmbed])

  useEffect(() => {
    void refreshAudioOutputs()
  }, [localStream, refreshAudioOutputs])

  useEffect(() => {
    if (!chatOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setChatOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [chatOpen])

  const allTileIds = useMemo(() => {
    const ids: string[] = [localPeerId, ...remoteList.map((p) => p.peerId)]
    if (isScreenSharing && localScreenStream) ids.push(localScreenTileKey(localPeerId))
    return ids
  }, [localPeerId, remoteList, isScreenSharing, localScreenStream])

  const stageLayout = layout === 'speaker' || layout === 'meet'

  const featuredPeerId = useMemo(() => {
    if (!stageLayout) return null
    if (speakerPinnedPeerId && allTileIds.includes(speakerPinnedPeerId)) return speakerPinnedPeerId

    if (layout === 'meet') {
      const remotePresenter = remoteList.find((p) => p.screenStream)
      if (remotePresenter) return remotePresenter.peerId
      if (isScreenSharing && localScreenStream) return localScreenTileKey(localPeerId)
      if (remoteList.length > 0) return remoteList[0].peerId
      return localPeerId
    }

    if (remoteList.length > 0) return remoteList[0].peerId
    return isScreenSharing && localScreenStream ? localScreenTileKey(localPeerId) : localPeerId
  }, [
    stageLayout,
    layout,
    speakerPinnedPeerId,
    allTileIds,
    remoteList,
    isScreenSharing,
    localScreenStream,
    localPeerId,
  ])

  const stripPeerIds = useMemo(() => {
    if (!stageLayout || !featuredPeerId) return []
    return allTileIds.filter((id) => id !== featuredPeerId)
  }, [stageLayout, featuredPeerId, allTileIds])

  const toggleSpeakerPin = (id: string) => {
    setSpeakerPinnedPeerId((p) => (p === id ? null : id))
  }

  useEffect(() => {
    if (layout !== 'speaker' && layout !== 'meet') setSpeakerPinnedPeerId(null)
  }, [layout])

  useEffect(() => {
    if (!isScreenSharing) {
      setSpeakerPinnedPeerId((p) => (p === localScreenTileKey(localPeerId) ? null : p))
    }
  }, [isScreenSharing, localPeerId])

  useEffect(() => {
    if (!isScreenSharing) setScreenStopDialogOpen(false)
  }, [isScreenSharing])

  useEffect(() => {
    if (!localStream) { setSourceAspect(null); return }
    const track = localStream.getVideoTracks()[0]
    if (!track) { setSourceAspect(null); return }
    const s = track.getSettings()
    if (s.width && s.height) setSourceAspect(s.width / s.height)
  }, [localStream])

  const resetView = () => {
    setLayout(isMobile ? 'grid' : 'pip')
    setObjectFit('contain')
    setPipPos ({ x: 16,  y: 10  })
    setPipSize(isMobile ? { w: 140, h: 94 } : { w: 220, h: 148 })
  }

  const remoteVideoStyle: React.CSSProperties = useMemo(
    () => ({ width: '100%', height: '100%', objectFit }),
    [objectFit],
  )

  const localVideoStyle = (inPip: boolean): React.CSSProperties => {
    if (inPip) return { width: '100%', height: '100%', objectFit: 'fill' }
    return { width: '100%', height: 'auto', objectFit, display: 'block' }
  }

  const gridStyle = (cols: number): React.CSSProperties => ({
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
  })

  const localSrt = srtByPeer[localPeerId]

  const localTile = (inPip: boolean, showSpeakerPin?: boolean) => (
    <LocalTile
      stream={localStream}
      name={name}
      isMuted={isMuted}
      isCamOff={isCamOff}
      videoStyle={localVideoStyle(inPip)}
      showInfo={showInfo}
      showMeter={showMeter}
      roomId={roomId}
      peerId={localPeerId}
      inPip={inPip}
      srtConnectUrl={localSrt?.connectUrlPublic}
      srtListenPort={localSrt?.listenPort}
      showPin={!!showSpeakerPin}
      pinActive={speakerPinnedPeerId === localPeerId}
      onRequestPin={() => toggleSpeakerPin(localPeerId)}
      reactionBurst={pickLatestBurstForPeer(reactionBursts, localPeerId)}
    />
  )

  const participantCount = rosterCount === 1
    ? '1 участник'
    : rosterCount < 5
      ? `${rosterCount} участника`
      : `${rosterCount} участников`

  const leaveMessage =
    leaveDialog && leaveDialog.others > 0
      ? `В комнате ещё ${leaveDialog.others} ${ruParticipantsWord(leaveDialog.others)}. Для них звонок продолжится.`
      : 'Вы отключитесь от комнаты.'

  const openLeaveDialog = (mode: 'home' | 'leave', others: number) => {
    setLeaveDialog({ mode, others })
  }

  const closeLeaveDialog = () => setLeaveDialog(null)

  const confirmLeave = () => {
    closeLeaveDialog()
    onLeave()
  }

  const onLogoHomeClick = () => {
    if (remoteList.length === 0) onLeave()
    else openLeaveDialog('home', remoteList.length)
  }

  const requestStopScreenSharing = () => {
    if (isScreenSharing) setScreenStopDialogOpen(true)
  }

  const closeScreenStopDialog = () => setScreenStopDialogOpen(false)

  const confirmStopScreenSharing = () => {
    closeScreenStopDialog()
    onToggleScreenShare()
  }

  const cardPlayout = {
    playoutVolume,
    playoutSinkId,
  }

  const orderedTileIds = useMemo(() => {
    const ids: string[] = [localPeerId]
    if (isScreenSharing && localScreenStream) ids.push(localScreenTileKey(localPeerId))
    ids.push(...remoteList.map((p) => p.peerId))
    return ids
  }, [localPeerId, isScreenSharing, localScreenStream, remoteList])

  const showSpeakerPinUi = layout === 'speaker' || layout === 'meet'

  const renderConferenceTile = (id: string) => {
    if (id === localPeerId) {
      return localTile(false, showSpeakerPinUi)
    }
    if (isLocalScreenTileKey(id, localPeerId) && localScreenStream) {
      return (
        <LocalScreenShareTile
          stream={localScreenStream}
          label={`${name} — экран`}
          roomId={roomId}
          ownerPeerId={localPeerId}
          videoStyle={remoteVideoStyle}
          showInfo={showInfo}
          srtConnectUrl={localSrt?.connectUrlPublic}
          srtListenPort={localSrt?.listenPort}
          onStopShare={requestStopScreenSharing}
          showPin={showSpeakerPinUi}
          pinActive={speakerPinnedPeerId === localScreenTileKey(localPeerId)}
          onRequestPin={() => toggleSpeakerPin(localScreenTileKey(localPeerId))}
          reactionBurst={pickLatestBurstForPeer(reactionBursts, localPeerId)}
        />
      )
    }
    const p = participants.get(id)
    if (!p) return null
    return (
      <ParticipantCard
        participant={p}
        videoStyle={remoteVideoStyle}
        showInfo={showInfo}
        showMeter={showMeter}
        roomId={roomId}
        srtConnectUrl={srtByPeer[id]?.connectUrlPublic}
        srtListenPort={srtByPeer[id]?.listenPort}
        {...cardPlayout}
        showPin={showSpeakerPinUi}
        pinActive={speakerPinnedPeerId === id}
        onRequestPin={() => toggleSpeakerPin(id)}
        reactionBurst={pickLatestBurstForPeer(reactionBursts, p.peerId)}
      />
    )
  }

  const mosaicStreamForId = (id: string): MediaStream | null => {
    if (id === localPeerId) return localStream
    if (isLocalScreenTileKey(id, localPeerId) && localScreenStream) return localScreenStream
    const p = participants.get(id)
    if (!p) return null
    return p.screenStream ?? p.videoStream ?? null
  }

  const mosaicForceLandscape = (id: string): boolean => {
    if (isLocalScreenTileKey(id, localPeerId)) return true
    const p = participants.get(id)
    return !!p?.screenStream
  }

  return (
    <div className="room-page">
      <ConfirmDialog
        open={leaveDialog !== null}
        title={leaveDialog?.mode === 'home' ? 'Выйти на главную?' : 'Покинуть комнату?'}
        message={leaveMessage}
        cancelLabel="Отмена"
        confirmLabel={leaveDialog?.mode === 'home' ? 'На главную' : 'Выйти'}
        onCancel={closeLeaveDialog}
        onConfirm={confirmLeave}
      />

      <ConfirmDialog
        open={screenStopDialogOpen}
        title="Завершить демонстрацию?"
        message="Участники перестанут видеть ваш экран."
        cancelLabel="Отмена"
        confirmLabel="Завершить"
        onCancel={closeScreenStopDialog}
        onConfirm={confirmStopScreenSharing}
      />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="room-header">
        <button type="button" className="room-logo-btn" onClick={onLogoHomeClick} title="На главную" aria-label="На главную">
          <img className="brand-logo brand-logo--header-h" src="/logo-h.png" alt="" draggable={false} />
        </button>

        <div className="room-center">
          <span className="room-name">{roomId}</span>
          <span className="room-count">({participantCount})</span>
        </div>

        <div className="header-right" />
      </header>

      <div
        className={`room-body${chatEmbed && chatOpen ? ' room-body--with-embed-chat' : ''}`}
      >
        <div
          className={`room-main${mobileSoloTiles ? ' room-main--mobile-solo-grid' : ''}${mobileMultiTiles ? ' room-main--mobile-multi-grid' : ''}`}
        >
      {/* ── Speaker / Meet (сцена + полоса превью) ─────────────────────── */}
      {stageLayout && featuredPeerId && (
        <>
          <div className={layout === 'meet' ? 'room-meet-main' : 'room-speaker-main'}>
            {isLocalScreenTileKey(featuredPeerId, localPeerId) && localScreenStream ? (
              <LocalScreenShareTile
                stream={localScreenStream}
                label={`${name} — экран`}
                roomId={roomId}
                ownerPeerId={localPeerId}
                videoStyle={remoteVideoStyle}
                showInfo={showInfo}
                srtConnectUrl={localSrt?.connectUrlPublic}
                srtListenPort={localSrt?.listenPort}
                onStopShare={requestStopScreenSharing}
                showPin
                pinActive={speakerPinnedPeerId === localScreenTileKey(localPeerId)}
                onRequestPin={() => toggleSpeakerPin(localScreenTileKey(localPeerId))}
                reactionBurst={pickLatestBurstForPeer(reactionBursts, localPeerId)}
              />
            ) : featuredPeerId === localPeerId ? (
              localTile(false, true)
            ) : participants.has(featuredPeerId) ? (
              <ParticipantCard
                participant={participants.get(featuredPeerId) as RemoteParticipant}
                videoStyle={remoteVideoStyle}
                showInfo={showInfo}
                showMeter={showMeter}
                roomId={roomId}
                srtConnectUrl={srtByPeer[featuredPeerId]?.connectUrlPublic}
                srtListenPort={srtByPeer[featuredPeerId]?.listenPort}
                {...cardPlayout}
                showPin
                pinActive={speakerPinnedPeerId === featuredPeerId}
                onRequestPin={() => toggleSpeakerPin(featuredPeerId)}
                reactionBurst={pickLatestBurstForPeer(reactionBursts, featuredPeerId)}
              />
            ) : null}
          </div>
          <div className={layout === 'meet' ? 'room-meet-strip' : 'room-speaker-strip'}>
            {stripPeerIds.map((id) => (
              <div key={id} className={layout === 'meet' ? 'room-meet-strip-tile' : 'room-speaker-strip-tile'}>
                {isLocalScreenTileKey(id, localPeerId) && localScreenStream ? (
                  <LocalScreenShareTile
                    stream={localScreenStream}
                    label={`${name} — экран`}
                    roomId={roomId}
                    ownerPeerId={localPeerId}
                    videoStyle={remoteVideoStyle}
                    showInfo={showInfo}
                    srtConnectUrl={localSrt?.connectUrlPublic}
                    srtListenPort={localSrt?.listenPort}
                    onStopShare={requestStopScreenSharing}
                    showPin
                    pinActive={speakerPinnedPeerId === localScreenTileKey(localPeerId)}
                    onRequestPin={() => toggleSpeakerPin(localScreenTileKey(localPeerId))}
                    reactionBurst={pickLatestBurstForPeer(reactionBursts, localPeerId)}
                  />
                ) : id === localPeerId ? (
                  localTile(false, true)
                ) : participants.has(id) ? (
                  <ParticipantCard
                    participant={participants.get(id) as RemoteParticipant}
                    videoStyle={remoteVideoStyle}
                    showInfo={showInfo}
                    showMeter={showMeter}
                    roomId={roomId}
                    srtConnectUrl={srtByPeer[id]?.connectUrlPublic}
                    srtListenPort={srtByPeer[id]?.listenPort}
                    {...cardPlayout}
                    showPin
                    pinActive={speakerPinnedPeerId === id}
                    onRequestPin={() => toggleSpeakerPin(id)}
                    reactionBurst={pickLatestBurstForPeer(reactionBursts, id)}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Grid layout ────────────────────────────────────────────────── */}
      {layout === 'grid' && (
        <div
          className={`tile-grid${mobileSoloTiles ? ' tile-grid--mobile-solo' : ''}${mobileMultiTiles ? ' tile-grid--mobile-multi' : ''}`}
          style={gridStyle(gridCols(rosterCount))}
        >
          {orderedTileIds.map((id) => (
            <React.Fragment key={id}>{renderConferenceTile(id)}</React.Fragment>
          ))}
        </div>
      )}

      {/* ── Горизонтальная полоса (скролл на мобильных) ───────────────── */}
      {layout === 'filmstrip' && (
        <div className={`room-filmstrip${mobileSoloTiles ? ' room-filmstrip--solo' : ''}`}>
          <div className="room-filmstrip__scroll">
            {orderedTileIds.map((id) => (
              <div key={id} className="room-filmstrip__cell">
                {renderConferenceTile(id)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Вертикальная колонка плиток ────────────────────────────────── */}
      {layout === 'strip_v' && (
        <div className={`room-strip-v${mobileSoloTiles ? ' room-strip-v--solo' : ''}`}>
          {orderedTileIds.map((id) => (
            <div key={id} className="room-strip-v__cell">
              {renderConferenceTile(id)}
            </div>
          ))}
        </div>
      )}

      {/* ── Мозаика: портрет/ландшафт по дорожке ───────────────────────── */}
      {layout === 'mosaic' && (
        <div className={`room-mosaic${mobileSoloTiles ? ' room-mosaic--solo' : ''}`}>
          {orderedTileIds.map((id) => (
            <MosaicTileShell
              key={id}
              stream={mosaicStreamForId(id)}
              forceLandscape={mosaicForceLandscape(id)}
            >
              {renderConferenceTile(id)}
            </MosaicTileShell>
          ))}
        </div>
      )}

      {/* ── PiP layout ─────────────────────────────────────────────────── */}
      {layout === 'pip' && (
        <div className="pip-container">
          <div
            className="tile-grid pip-grid"
            style={gridStyle(gridCols(Math.max(1, remoteList.length + (isScreenSharing ? 1 : 0))))}
          >
            {remoteList.length === 0 && !isScreenSharing ? (
              <div className="pip-waiting">Ожидание участников…</div>
            ) : (
              <>
                {isScreenSharing && localScreenStream && (
                  <LocalScreenShareTile
                    stream={localScreenStream}
                    label={`${name} — экран`}
                    roomId={roomId}
                    ownerPeerId={localPeerId}
                    videoStyle={remoteVideoStyle}
                    showInfo={showInfo}
                    srtConnectUrl={localSrt?.connectUrlPublic}
                    srtListenPort={localSrt?.listenPort}
                    onStopShare={requestStopScreenSharing}
                    reactionBurst={pickLatestBurstForPeer(reactionBursts, localPeerId)}
                  />
                )}
                {remoteList.map(p => (
                  <ParticipantCard key={p.peerId} participant={p}
                    videoStyle={remoteVideoStyle}
                    showInfo={showInfo} showMeter={showMeter} roomId={roomId}
                    srtConnectUrl={srtByPeer[p.peerId]?.connectUrlPublic}
                    srtListenPort={srtByPeer[p.peerId]?.listenPort}
                    {...cardPlayout}
                    reactionBurst={pickLatestBurstForPeer(reactionBursts, p.peerId)}
                  />
                ))}
              </>
            )}
          </div>
          <DraggablePip
            pos={pipPos}   onPosChange={setPipPos}
            size={pipSize} onSizeChange={setPipSize}
            lockAspect={sourceAspect}
            srtCopy={{
              connectUrl: localSrt?.connectUrlPublic,
              listenPort: localSrt?.listenPort,
              roomId,
              peerId: localPeerId,
            }}
          >
            {localTile(true)}
          </DraggablePip>
        </div>
      )}
        </div>

        {chatEmbed && chatOpen && (
          <div className="room-chat-sidebar">
            <RoomChatPanel
              variant="embed"
              open
              onClose={() => setChatOpen(false)}
              messages={chatMessages}
              localPeerId={localPeerId}
              onSend={onSendChatMessage}
            />
          </div>
        )}
      </div>

      <ControlsBar
        isMuted={isMuted}
        isCamOff={isCamOff}
        cameras={cameras}
        microphones={microphones}
        selectedCameraId={selectedCameraId}
        selectedMicId={selectedMicId}
        onToggleMute={onToggleMute}
        onToggleCam={onToggleCam}
        onLeaveRequest={() => openLeaveDialog('leave', remoteList.length)}
        onSwitchCamera={id => { setSelectedCameraId(id); onSwitchCamera(id) }}
        onSwitchMic={id => { setSelectedMicId(id); onSwitchMic(id) }}
        activePreset={activePreset}
        onChangePreset={onChangePreset}
        objectFit={objectFit}
        onObjectFitToggle={() => setObjectFit(f => f === 'cover' ? 'contain' : 'cover')}
        layout={layout}
        onLayoutChange={setLayout}
        showMeter={showMeter}
        onToggleMeter={() => setShowMeter(v => !v)}
        showInfo={showInfo}
        onToggleInfo={() => setShowInfo(v => !v)}
        onResetView={resetView}
        isScreenSharing={isScreenSharing}
        onToggleScreenShare={requestStopScreenSharing}
        onStartScreenShare={onStartScreenShare}
        playoutVolume={playoutVolume}
        onPlayoutVolumeChange={setPlayoutVolume}
        audioOutputs={audioOutputs}
        playoutSinkId={playoutSinkId}
        onPlayoutSinkChange={setPlayoutSinkId}
        showButtonLabels={showControlButtonLabels}
        onToggleButtonLabels={() => setShowControlButtonLabels((v) => !v)}
        chatOpen={chatOpen}
        onToggleChat={() => setChatOpen(!chatOpen)}
        chatUnreadCount={chatUnreadCount}
        chatEmbed={chatEmbed}
        onToggleChatEmbed={() => setChatEmbed((v) => !v)}
        onSendReaction={onSendReaction}
      />

      {chatOpen && !chatEmbed && (
        <RoomChatPanel
          variant="overlay"
          open
          onClose={() => setChatOpen(false)}
          messages={chatMessages}
          localPeerId={localPeerId}
          onSend={onSendChatMessage}
        />
      )}
    </div>
  )
}

function MosaicTileShell({
  stream,
  forceLandscape,
  children,
}: {
  stream: MediaStream | null
  forceLandscape: boolean
  children: React.ReactNode
}) {
  const orientation = useVideoOrientation(stream, { forceLandscape })
  return (
    <div className={`room-mosaic-cell room-mosaic-cell--${orientation}`}>
      {children}
    </div>
  )
}

// ─── Local tile ───────────────────────────────────────────────────────────────

function LocalTile({
  stream, name, isMuted, isCamOff, videoStyle, showInfo, showMeter,
  roomId, peerId, inPip, srtConnectUrl, srtListenPort,
  showPin, pinActive, onRequestPin,
  reactionBurst,
}: {
  stream: MediaStream | null
  name: string
  isMuted: boolean
  isCamOff: boolean
  videoStyle: React.CSSProperties
  showInfo?: boolean
  showMeter?: boolean
  roomId: string
  peerId: string
  inPip: boolean
  srtConnectUrl?: string
  srtListenPort?: number
  showPin?: boolean
  pinActive?: boolean
  onRequestPin?: () => void
  reactionBurst?: RoomReactionBurst | null
}) {
  const mainVideoRef = useRef<HTMLVideoElement>(null)

  const mainStream = stream
  const showMainVideo = !isCamOff && !!stream
  const showAvatar = !showMainVideo

  useEffect(() => {
    if (mainVideoRef.current) mainVideoRef.current.srcObject = mainStream
  }, [mainStream])

  const videoInner = (
    <>
      <video
        ref={mainVideoRef}
        autoPlay
        playsInline
        muted
        className={showMainVideo ? 'participant-card__main-video' : 'participant-card__main-video hidden'}
        style={videoStyle}
      />
      {showAvatar && <div className="cam-off-avatar">{name.charAt(0).toUpperCase()}</div>}
      {showMeter && !isMuted && <AudioMeter stream={stream} stereo />}
      {showInfo && (
        <VideoInfoOverlay
          stream={mainStream}
          videoRef={mainVideoRef}
          roomId={roomId}
          peerId={peerId}
          srtConnectUrl={srtConnectUrl}
        />
      )}
    </>
  )

  const barInner = (
    <>
      <span className="card-name">{name} (вы)</span>
      <span className="card-bar-actions">
        {isMuted && <MutedSvg />}
        {showPin && onRequestPin && (
          <button
            type="button"
            className={`card-pin-btn ${pinActive ? 'card-pin-btn--on' : ''}`}
            title={pinActive ? 'Снять закрепление' : 'Закрепить в режиме спикера'}
            aria-pressed={pinActive}
            onClick={(e) => {
              e.stopPropagation()
              onRequestPin()
            }}
          >
            <PinIconLocal />
          </button>
        )}
      </span>
    </>
  )

  return (
    <div className="participant-card participant-card--local">
      <div className="card-video-wrap">
        {inPip ? (
          <>
            {videoInner}
            {reactionBurst ? <ReactionBurstOverlay key={reactionBurst.id} burst={reactionBurst} /> : null}
          </>
        ) : (
          <SrtCopySurface
            connectUrl={srtConnectUrl}
            listenPort={srtListenPort}
            roomId={roomId}
            tilePeerId={peerId}
          >
            {videoInner}
            {reactionBurst ? <ReactionBurstOverlay key={reactionBurst.id} burst={reactionBurst} /> : null}
          </SrtCopySurface>
        )}
      </div>
      <div className="card-bar">
        {inPip ? (
          <SrtCopySurface
            connectUrl={srtConnectUrl}
            listenPort={srtListenPort}
            roomId={roomId}
            tilePeerId={peerId}
            className="srt-copy-target--bar"
          >
            {barInner}
          </SrtCopySurface>
        ) : (
          barInner
        )}
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function gridCols(n: number): number {
  if (n <= 1) return 1
  if (n <= 2) return 2
  if (n <= 4) return 2
  if (n <= 6) return 3
  return 3
}

function MutedSvg() {
  return (
    <svg className="muted-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
      <path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23M12 19v4M8 23h8" />
    </svg>
  )
}

function PinIconLocal() {
  return (
    <svg className="card-pin-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z" />
    </svg>
  )
}

