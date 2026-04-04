interface Props {
  isAudioMuted: boolean
  isVideoOff: boolean
  onToggleAudio: () => void
  onToggleVideo: () => void
  onLeave: () => void
}

export function Controls({ isAudioMuted, isVideoOff, onToggleAudio, onToggleVideo, onLeave }: Props) {
  return (
    <div className="controls">
      <button
        className={`ctrl-btn ${isAudioMuted ? 'ctrl-btn--off' : ''}`}
        onClick={onToggleAudio}
        title={isAudioMuted ? 'Включить микрофон' : 'Выключить микрофон'}
      >
        {isAudioMuted ? <MicOffIcon /> : <MicIcon />}
        <span>{isAudioMuted ? 'Включить' : 'Звук'}</span>
      </button>

      <button
        className={`ctrl-btn ${isVideoOff ? 'ctrl-btn--off' : ''}`}
        onClick={onToggleVideo}
        title={isVideoOff ? 'Включить камеру' : 'Выключить камеру'}
      >
        {isVideoOff ? <CamOffIcon /> : <CamIcon />}
        <span>{isVideoOff ? 'Включить' : 'Камера'}</span>
      </button>

      <button className="ctrl-btn ctrl-btn--leave" onClick={onLeave} title="Покинуть комнату">
        <LeaveIcon />
        <span>Выйти</span>
      </button>
    </div>
  )
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
      <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
    </svg>
  )
}

function MicOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
      <path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23M12 19v4M8 23h8" />
    </svg>
  )
}

function CamIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  )
}

function CamOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M21 21H3a2 2 0 01-2-2V8a2 2 0 012-2h3m3-3h6l2 3h3a2 2 0 012 2v9.34" />
      <path d="M16 11.37A4 4 0 1112.63 8L16 11.37z" />
    </svg>
  )
}

function LeaveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  )
}
