export function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
      <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
    </svg>
  )
}

export function MicOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
      <path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23M12 19v4M8 23h8" />
    </svg>
  )
}

export function CamIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  )
}

/** Та же видеокамера, что у CamIcon, с перечёркиванием (камера выкл.). */
export function CamOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  )
}

export function DashboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  )
}

export function InviteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="9" cy="7" r="4" />
      <path d="M3 21v-2a7 7 0 0 1 10.46-6.08" />
      <line x1="19" y1="13" x2="19" y2="21" />
      <line x1="15" y1="17" x2="23" y2="17" />
    </svg>
  )
}

export function ChatBubbleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 11.5a8.5 8.5 0 01-8.5 8.5 8.8 8.8 0 01-3.18-.58L3 21l1.73-5.08A8.5 8.5 0 1112.5 20" />
    </svg>
  )
}

/** Комнаты / сетка эфиров — для раздела архивов комнат (не путать с личным мессенджером). */
export function RoomsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  )
}

export function StarIcon({ filled = false }: { filled?: boolean }) {
  if (filled) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 2.8l2.75 5.58 6.16.9-4.46 4.34 1.06 6.13L12 16.86 6.49 19.75l1.05-6.13L3.09 9.28l6.16-.9L12 2.8z" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2.8l2.75 5.58 6.16.9-4.46 4.34 1.06 6.13L12 16.86 6.49 19.75l1.05-6.13L3.09 9.28l6.16-.9L12 2.8z" />
    </svg>
  )
}

/** Завершить звонок: трубка в круге. */
export function EndCallIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path
        fill="#fff"
        d="M11.05 14.2c1.9.95 3.9.95 5.8 0 .28-.14.46-.42.46-.73v-.95c0-.26-.14-.5-.37-.63l-1.12-.56a.75.75 0 0 0-.88.18l-.35.47a.75.75 0 0 1-.95.18 6.2 6.2 0 0 1-2.18-2.18.75.75 0 0 1 .18-.95l.47-.35a.75.75 0 0 0 .18-.88l-.56-1.12a.75.75 0 0 0-.63-.37h-.95c-.31 0-.59.18-.73.46a8.1 8.1 0 0 0 0 7.4z"
      />
    </svg>
  )
}

/** Во весь экран — четыре угла «наружу», одинаковый отступ от края viewBox. */
export function FullscreenEnterIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 3H3v6M15 3h6v6M3 15v6h6M21 15v6h-6" />
    </svg>
  )
}

/** Выйти из полноэкранного — углы «внутрь», симметрично enter. */
export function FullscreenExitIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6" />
    </svg>
  )
}

/** Участники в шапке комнаты: силуэты гостей. */
export function ParticipantsBadgeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="9" cy="7" r="3.5" />
      <path d="M3 19v-1.5a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5V19" />
      <circle cx="17" cy="8" r="2.5" />
      <path d="M21 19v-1a3.5 3.5 0 0 0-2.45-3.33" />
    </svg>
  )
}

/** Админ-панель: щит (шапка кабинета). */
export function AdminPanelIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}
