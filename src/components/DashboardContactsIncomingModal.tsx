import { useEffect, useMemo, useState } from 'react'
import type { ContactCard } from '../lib/socialGraph'
import { setContactPin } from '../lib/socialGraph'
import { hideIncomingPinRow, unhideIncomingPinRow } from '../lib/dashboardIncomingPinsHidden'
import { StarIcon } from './icons'

export interface DashboardContactsIncomingModalProps {
  open: boolean
  onClose: () => void
  userId: string
  items: ContactCard[]
  hiddenIds: string[]
  showHidden: boolean
  onShowHiddenChange: (v: boolean) => void
  onHiddenChange: () => void
  onContactsUpdated: () => void
}

export function DashboardContactsIncomingModal({
  open,
  onClose,
  userId,
  items,
  hiddenIds,
  showHidden,
  onShowHiddenChange,
  onHiddenChange,
  onContactsUpdated,
}: DashboardContactsIncomingModalProps) {
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const incoming = useMemo(
    () => items.filter((c) => c.pinnedMe && !c.pinnedByMe),
    [items],
  )

  const hiddenSet = useMemo(() => new Set(hiddenIds), [hiddenIds])

  const visibleRows = useMemo(() => {
    return incoming.filter((c) => showHidden || !hiddenSet.has(c.targetUserId))
  }, [incoming, hiddenSet, showHidden])

  if (!open) return null

  const addPin = async (targetUserId: string) => {
    if (busy) return
    setBusy(targetUserId)
    const res = await setContactPin(targetUserId, true)
    setBusy(null)
    if (!res.error) onContactsUpdated()
  }

  const hideRequest = (targetUserId: string) => {
    hideIncomingPinRow(userId, targetUserId)
    onHiddenChange()
  }

  const unhideRequest = (targetUserId: string) => {
    unhideIncomingPinRow(userId, targetUserId)
    onHiddenChange()
  }

  return (
    <div className="confirm-dialog-root">
      <button type="button" className="confirm-dialog-backdrop" aria-label="Закрыть" onClick={onClose} />
      <div
        className="confirm-dialog dashboard-profile-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-contacts-incoming-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="dashboard-contacts-incoming-title" className="confirm-dialog__title">
          Входящие закрепы
        </h2>
        <div className="dashboard-profile-modal__scroll">
          <p className="dashboard-field__hint" style={{ marginTop: 0 }}>
            Кто-то закрепил вас у себя. Закрепите в ответ — станете взаимными контактами. «Скрыть» убирает строку из
            списка (считается просмотренным).
          </p>
          <div className="dashboard-field__inline dashboard-field__inline--toggle" style={{ marginBottom: '12px' }}>
            <span className="dashboard-field__label">Показать скрытые</span>
            <button type="button" className="join-btn" onClick={() => onShowHiddenChange(!showHidden)}>
              {showHidden ? 'Скрытые: вкл.' : 'Скрытые: выкл.'}
            </button>
          </div>
          {visibleRows.length === 0 ? (
            <p className="dashboard-field__hint">Сейчас таких запросов нет.</p>
          ) : (
            <ul className="dashboard-incoming-fav-modal__list">
              {visibleRows.map((row) => {
                const isHidden = hiddenSet.has(row.targetUserId)
                return (
                  <li key={row.targetUserId} className="dashboard-incoming-fav-modal__row">
                    <div className="dashboard-incoming-fav-modal__who">
                      {row.avatarUrl ? (
                        <img src={row.avatarUrl} alt="" className="dashboard-incoming-fav-modal__avatar" />
                      ) : (
                        <span className="dashboard-incoming-fav-modal__avatar dashboard-incoming-fav-modal__avatar--ph">
                          {row.displayName.charAt(0).toUpperCase()}
                        </span>
                      )}
                      <div>
                        <div className="dashboard-incoming-fav-modal__name">{row.displayName}</div>
                        {row.profileSlug ? (
                          <div className="dashboard-incoming-fav-modal__slug">@{row.profileSlug}</div>
                        ) : null}
                        {isHidden ? <span className="dashboard-incoming-fav-modal__badge">Скрыто</span> : null}
                      </div>
                    </div>
                    <div className="dashboard-incoming-fav-modal__actions">
                      {!row.pinnedByMe ? (
                        <button
                          type="button"
                          className="join-btn"
                          disabled={busy === row.targetUserId}
                          onClick={() => void addPin(row.targetUserId)}
                        >
                          <span className="dashboard-incoming-fav-modal__btn-inner">
                            <StarIcon filled={false} />
                            <span>Закрепить</span>
                          </span>
                        </button>
                      ) : null}
                      {isHidden ? (
                        <button
                          type="button"
                          className="dashboard-incoming-fav-banner__dismiss"
                          onClick={() => unhideRequest(row.targetUserId)}
                        >
                          Вернуть
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="dashboard-incoming-fav-banner__dismiss"
                          onClick={() => hideRequest(row.targetUserId)}
                        >
                          Скрыть
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <div className="dashboard-profile-modal__foot">
          <button type="button" className="confirm-dialog__btn confirm-dialog__btn--secondary" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}
