import type { HTMLAttributes } from 'react'

export type FiRrIconProps = {
  /** Имя иконки без префикса: `home` → классы `fi fi-rr-home`. Список: flaticon.com/uicons */
  name: string
} & Omit<HTMLAttributes<HTMLElement>, 'children'>

/**
 * Иконка из [@flaticon/flaticon-uicons](https://www.flaticon.com/uicons) (regular rounded, префикс `fi-rr-`).
 * Стили `regular/rounded` подключены в `main.tsx`. Лицензия пакета требует атрибуции Flaticon там, где это уместно.
 */
export function FiRrIcon({ name, className, 'aria-hidden': ariaHidden, ...rest }: FiRrIconProps) {
  const key = name.trim()
  if (!key) return null
  return (
    <i
      className={['fi', `fi-rr-${key}`, className].filter(Boolean).join(' ')}
      aria-hidden={ariaHidden ?? true}
      {...rest}
    />
  )
}

/** SVG-иконки приложения (named exports). При ошибке «нет экспорта» в dev — очистить `node_modules/.vite` и перезапустить Vite. */
export function MicIcon() {
  return <FiRrIcon name="microphone" />
}

/** Студийный микрофон — кнопка записи голоса в композере (фиксированный слот по ширине иконки). */
export function VoiceRecordComposerIcon({ className }: { className?: string } = {}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z" />
      <path d="M8 11v1a4 4 0 0 0 8 0v-1" />
      <line x1="12" y1="18" x2="12" y2="15" />
      <line x1="9" y1="21" x2="15" y2="21" />
    </svg>
  )
}

export function MicOffIcon({ className }: { className?: string }) {
  return <FiRrIcon name="microphone-slash" className={className} />
}

export function CamIcon() {
  return <FiRrIcon name="video-camera" />
}

export function CamOffIcon() {
  return <FiRrIcon name="video-slash" />
}

export function DashboardIcon() {
  return <FiRrIcon name="dashboard" />
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
  return <FiRrIcon name="comment" />
}

/** Звук уведомлений мессенджера — контур, как у прочих иконок шапки кабинета. */
export function BellIcon() {
  return <FiRrIcon name="bell" />
}

export function BellOffIcon() {
  return <FiRrIcon name="bell-slash" />
}

/** Настройки: шестерёнка с «зубьями», не путать с солнцем (круг + лучи). */
export function SettingsGearIcon({ className }: { className?: string } = {}) {
  return <FiRrIcon name="settings" className={className} />
}

/** Назад (мобильный мессенджер и др.). */
export function ChevronLeftIcon() {
  return <FiRrIcon name="angle-small-left" />
}

/** Вперёд (пагинация и др.). */
export function ChevronRightIcon() {
  return <FiRrIcon name="angle-small-right" />
}

/** Новая комната — плюс в шапке кабинета. */
export function PlusIcon() {
  return <FiRrIcon name="plus" />
}

/** Выход из аккаунта — шапка кабинета. */
export function LogOutIcon() {
  return <FiRrIcon name="sign-out-alt" />
}

export function HomeIcon() {
  return <FiRrIcon name="home" />
}

/** Комнаты / сетка эфиров — для раздела архивов комнат (не путать с личным мессенджером). */
export function RoomsIcon() {
  return <FiRrIcon name="grid" />
}

/** Фильтр дерева чатов мессенджера: все типы бесед (сетка — как «все разделы»). */
export function MessengerFilterAllIcon({ className }: { className?: string } = {}) {
  return <FiRrIcon name="grid" className={className} />
}

/** Фильтр: только личные диалоги. */
export function MessengerFilterDirectIcon({ className }: { className?: string } = {}) {
  return <FiRrIcon name="comment" className={className} />
}

/** Фильтр: групповые чаты. */
export function MessengerFilterGroupIcon({ className }: { className?: string } = {}) {
  return <FiRrIcon name="users" className={className} />
}

/** Фильтр: каналы — вышка / вещание (как «антенна с сигналом»). */
export function MessengerFilterChannelIcon({ className }: { className?: string } = {}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {/* Левая тройка дуг */}
      <path d="M10.25 8.2 Q6.8 12 10.25 15.8" />
      <path d="M9.35 5.8 Q3.6 12 9.35 18.2" />
      <path d="M8.4 3.5 Q1.2 12 8.4 20.5" />
      {/* Правая тройка дуг */}
      <path d="M13.75 8.2 Q17.2 12 13.75 15.8" />
      <path d="M14.65 5.8 Q20.4 12 14.65 18.2" />
      <path d="M15.6 3.5 Q22.8 12 15.6 20.5" />
      {/* Мачта + шар наверху */}
      <line x1="12" y1="7.8" x2="12" y2="17.6" />
      <circle cx="12" cy="5.5" r="2.15" />
      {/* Сужающееся основание */}
      <path d="M10.2 17.6h3.6l1.1 3.9H9.1l1.1-3.9z" />
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

/** Участники в шапке комнаты: силуэты гостей. */
export function ParticipantsBadgeIcon() {
  return <FiRrIcon name="users" />
}

/** Админ-панель: щит (шапка кабинета). */
export function AdminPanelIcon() {
  return <FiRrIcon name="shield" />
}

/** Запросы на вход в комнату. */
export function JoinRequestsIcon() {
  return <FiRrIcon name="person-circle-question" />
}

/** Вложение / фото в композере мессенджера — спокойный контур, как у прочих иконок кабинета. */
export function AttachmentIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  )
}

/** Отправка сообщения в композере мессенджера (самолётик). */
export function MessengerSendPlaneIcon({ className }: { className?: string } = {}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4L22 2Z" />
    </svg>
  )
}

/** Три полоски — меню (мобильный мессенджер и др.). */
export function MenuBurgerIcon() {
  return <FiRrIcon name="menu-burger" />
}

/** Удалить из списка / корзина. */
export function TrashIcon() {
  return <FiRrIcon name="trash" />
}

/** Закрыть (лайтбокс и др.). */
export function XCloseIcon() {
  return <FiRrIcon name="cross" />
}
