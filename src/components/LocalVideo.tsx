import { useEffect, useRef } from 'react'

interface Props {
  stream: MediaStream | null
  name: string
  isMuted: boolean
  isCamOff: boolean
}

export function LocalVideo({ stream, name, isMuted, isCamOff }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream
  }, [stream])

  return (
    <div className="participant-card participant-card--local">
      <div className="card-video-wrap">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={isCamOff ? 'hidden' : ''}
        />
        {isCamOff && (
          <div className="cam-off-avatar">
            {name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div className="card-bar">
        <span className="card-name">{name} (вы)</span>
        {isMuted && <MutedIcon />}
      </div>
    </div>
  )
}

function MutedIcon() {
  return (
    <svg className="muted-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
      <path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23M12 19v4M8 23h8" />
    </svg>
  )
}
