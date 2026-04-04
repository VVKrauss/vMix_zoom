import { useEffect, useRef } from 'react'

interface Props {
  stream: MediaStream | null
  displayName: string
  srtPort?: number
  isLocal?: boolean
  isAudioMuted?: boolean
  isVideoOff?: boolean
  isSrtActive?: boolean
}

export function VideoTile({
  stream,
  displayName,
  srtPort,
  isLocal = false,
  isAudioMuted = false,
  isVideoOff = false,
  isSrtActive = false,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    if (stream) {
      el.srcObject = stream
    } else {
      el.srcObject = null
    }
  }, [stream])

  return (
    <div className={`tile ${isLocal ? 'tile--local' : ''}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal} // don't play back your own audio
        className={`tile__video ${isVideoOff ? 'tile__video--hidden' : ''}`}
      />

      {/* Audio for remote: separate audio element */}
      {!isLocal && stream && <AudioOutput stream={stream} />}

      {/* Video off placeholder */}
      {isVideoOff && (
        <div className="tile__avatar">
          <span>{displayName.charAt(0).toUpperCase()}</span>
        </div>
      )}

      {/* Bottom bar */}
      <div className="tile__bar">
        <span className="tile__name">
          {isLocal ? `${displayName} (вы)` : displayName}
        </span>
        <div className="tile__badges">
          {isAudioMuted && (
            <span className="tile__badge tile__badge--muted" title="Микрофон выключен">
              <MicOffIcon />
            </span>
          )}
          {srtPort && (
            <span
              className={`tile__badge tile__badge--srt ${isSrtActive ? 'tile__badge--srt-active' : ''}`}
              title={`SRT порт: ${srtPort}`}
            >
              SRT :{srtPort}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Audio output for remote streams ─────────────────────────────────────────

function AudioOutput({ stream }: { stream: MediaStream }) {
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    el.srcObject = stream
  }, [stream])

  return <audio ref={audioRef} autoPlay playsInline style={{ display: 'none' }} />
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function MicOffIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v3m0 0h-3m3 0h3M3 3l18 18M9 9v3a3 3 0 004.12 2.77M15 9.34V6a3 3 0 00-5.94-.6" />
    </svg>
  )
}
