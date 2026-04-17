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

/** Фильтр: каналы (лента / трансляция). */
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
      <circle cx="6" cy="18" r="1.5" />
      <path d="M10 18a4 4 0 0 0-4-4" />
      <path d="M14 18a8 8 0 0 0-8-8" />
      <path d="M19 5v14" />
      <path d="M17 7h4" />
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
