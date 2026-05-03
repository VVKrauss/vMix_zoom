import { createPortal } from 'react-dom'
import { useEffect, useMemo } from 'react'
import { PillToggle } from '../PillToggle'
import type { MessengerConversationSummary } from '../../lib/messengerConversations'
import type { ConversationStaffMember, ConversationStaffRole } from '../../lib/conversationStaff'
import {
  canViewMessengerConversationAdminStats,
  conversationInitial,
  isMessengerClosedGroupOrChannel,
  messengerContactDisplayName,
  messengerStaffRoleShortLabel,
} from '../../lib/messengerDashboardUtils'
import { FiRrIcon, MessengerStatsIcon } from '../icons'
import { useMessengerContactAliasesMap } from '../../hooks/useMessengerContactAliasesMap'
import { MessengerClosedGcLockBadge } from './MessengerClosedGcLockBadge'

export type MessengerConversationInfoModalProps = {
  open: boolean
  conversation: MessengerConversationSummary | null
  avatarUrl: string | null
  notificationsMuted: boolean
  notificationsMuteBusy: boolean
  onToggleNotificationsMuted: (next: boolean) => void
  conversationInfoError: string | null
  conversationInfoLoading: boolean
  conversationInfoEdit: boolean
  setConversationInfoEdit: (v: boolean | ((p: boolean) => boolean)) => void
  conversationInfoTitle: string
  setConversationInfoTitle: (v: string) => void
  conversationInfoNick: string
  setConversationInfoNick: (v: string) => void
  conversationInfoIsOpen: boolean
  setConversationInfoIsOpen: (v: boolean) => void
  conversationInfoChannelComments: 'comments' | 'reactions_only'
  setConversationInfoChannelComments: (v: 'comments' | 'reactions_only') => void
  conversationInfoLogoFile: File | null
  setConversationInfoLogoFile: (f: File | null) => void
  conversationInfoRole: string | null
  conversationStaffRows: ConversationStaffMember[]
  conversationStaffLoading: boolean
  conversationStaffTargetUserId: string
  setConversationStaffTargetUserId: (v: string) => void
  conversationStaffNewRole: ConversationStaffRole
  setConversationStaffNewRole: (v: ConversationStaffRole) => void
  conversationStaffMutating: boolean
  leaveError: string | null
  leaveBusy: boolean
  leaveConfirmOpen: boolean
  setLeaveConfirmOpen: (v: boolean) => void
  onClose: () => void
  onShareInvite: () => void
  onSave: () => void
  onCancelEdit: () => void
  onApplyStaffRole: () => void
  onLeaveConfirm: () => void
  /** Статистика (owner/admin группы; owner/admin/moderator канала). */
  onOpenConversationStats?: () => void
}

export function MessengerConversationInfoModal({
  open,
  conversation,
  avatarUrl,
  notificationsMuted,
  notificationsMuteBusy,
  onToggleNotificationsMuted,
  conversationInfoError,
  conversationInfoLoading,
  conversationInfoEdit,
  setConversationInfoEdit,
  conversationInfoTitle,
  setConversationInfoTitle,
  conversationInfoNick,
  setConversationInfoNick,
  conversationInfoIsOpen,
  setConversationInfoIsOpen,
  conversationInfoChannelComments,
  setConversationInfoChannelComments,
  conversationInfoLogoFile,
  setConversationInfoLogoFile,
  conversationInfoRole,
  conversationStaffRows,
  conversationStaffLoading,
  conversationStaffTargetUserId,
  setConversationStaffTargetUserId,
  conversationStaffNewRole,
  setConversationStaffNewRole,
  conversationStaffMutating,
  leaveError,
  leaveBusy,
  leaveConfirmOpen,
  setLeaveConfirmOpen,
  onClose,
  onShareInvite,
  onSave,
  onCancelEdit,
  onApplyStaffRole,
  onLeaveConfirm,
  onOpenConversationStats,
}: MessengerConversationInfoModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (leaveConfirmOpen && !leaveBusy) {
        setLeaveConfirmOpen(false)
        return
      }
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, leaveConfirmOpen, leaveBusy, onClose, setLeaveConfirmOpen])

  const staffUserIds = useMemo(
    () => conversationStaffRows.map((r) => r.user_id.trim()).filter(Boolean),
    [conversationStaffRows],
  )
  const staffAliasByUserId = useMessengerContactAliasesMap(Boolean(open && conversation), staffUserIds)

  if (!open || !conversation) return null

  const c = conversation

  return createPortal(
    <div className="messenger-settings-modal-root" role="dialog" aria-modal="true" aria-labelledby="messenger-conv-info-title">
      <button type="button" className="messenger-settings-modal-backdrop" aria-label="Закрыть" onClick={onClose} />
      <div className="messenger-settings-modal">
        <h2 id="messenger-conv-info-title" className="messenger-settings-modal__title">
          {c.kind === 'channel' ? 'Канал' : 'Группа'}
        </h2>

        {conversationInfoError ? <p className="join-error">{conversationInfoError}</p> : null}

        <div className="messenger-settings-modal__section">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flex: 1, minWidth: 0 }}>
              <div className="dashboard-messenger__gc-avatar-lock-wrap dashboard-messenger__gc-avatar-lock-wrap--modal">
                <button type="button" className="dashboard-messenger__thread-head-center-avatar" aria-label="Логотип">
                  {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{conversationInitial(c.title)}</span>}
                </button>
                {isMessengerClosedGroupOrChannel(c) ? <MessengerClosedGcLockBadge size="modal" /> : null}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <strong style={{ overflowWrap: 'anywhere' }}>{c.title}</strong>
                <span className="messenger-settings-modal__hint">
                  {(c.memberCount ?? 0)} участн.
                  {c.publicNick?.trim() ? ` · @${c.publicNick.trim()}` : ''}
                </span>
              </div>
            </div>
            {conversationInfoRole && canViewMessengerConversationAdminStats(c.kind, conversationInfoRole) ? (
              <div className="dashboard-messenger__list-head-actions">
                <button
                  type="button"
                  className={`dashboard-messenger__list-head-btn${conversationInfoEdit ? ' dashboard-messenger__list-head-btn--open' : ''}`}
                  aria-label={conversationInfoEdit ? 'Закрыть редактирование' : 'Редактировать'}
                  title={conversationInfoEdit ? 'Закрыть редактирование' : 'Редактировать'}
                  aria-pressed={conversationInfoEdit}
                  disabled={conversationInfoLoading}
                  onClick={() => setConversationInfoEdit((v) => !v)}
                >
                  <FiRrIcon name="pencil" />
                </button>
                {onOpenConversationStats ? (
                  <button
                    type="button"
                    className="dashboard-messenger__list-head-btn"
                    aria-label="Статистика"
                    title="Статистика"
                    disabled={conversationInfoLoading}
                    onClick={() => onOpenConversationStats()}
                  >
                    <MessengerStatsIcon />
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="messenger-settings-modal__section">
          <button type="button" className="messenger-settings-modal__row-btn" onClick={() => void onShareInvite()}>
            <span className="messenger-settings-modal__row-ico" aria-hidden>
              ⤴
            </span>
            Поделиться ссылкой
          </button>
        </div>

        <div className="messenger-settings-modal__section">
          <div className="messenger-settings-modal__push-row">
            <span className="messenger-settings-modal__label">Уведомления</span>
            <PillToggle
              compact
              checked={!notificationsMuted}
              onCheckedChange={(next) => onToggleNotificationsMuted(!next)}
              offLabel="Выкл."
              onLabel="Вкл."
              ariaLabel="Уведомления для этого чата"
              disabled={notificationsMuteBusy}
            />
          </div>
          <p className="messenger-settings-modal__hint" style={{ marginTop: 6 }}>
            Отключает push и звук уведомлений для этого чата.
          </p>
        </div>

        {conversationInfoEdit ? (
          <>
            <div className="messenger-settings-modal__section">
              <label className="messenger-settings-modal__label" htmlFor="messenger-conv-info-title-input">
                Название
              </label>
              <input
                id="messenger-conv-info-title-input"
                className="dashboard-messenger__list-search-input"
                value={conversationInfoTitle}
                disabled={conversationInfoLoading}
                onChange={(e) => setConversationInfoTitle(e.target.value)}
                autoComplete="off"
              />
            </div>

            <div className="messenger-settings-modal__section">
              <label className="messenger-settings-modal__label" htmlFor="messenger-conv-info-nick-input">
                Ник (для ссылки)
              </label>
              <input
                id="messenger-conv-info-nick-input"
                className="dashboard-messenger__list-search-input"
                value={conversationInfoNick}
                disabled={conversationInfoLoading}
                onChange={(e) => setConversationInfoNick(e.target.value)}
                autoComplete="off"
              />
              <p className="messenger-settings-modal__hint">Только a-z, 0-9, _ (3–32). Можно оставить пустым.</p>
            </div>

            {c.kind === 'channel' ? (
              <>
                <div className="messenger-settings-modal__section">
                  <div className="messenger-settings-modal__push-row">
                    <span className="messenger-settings-modal__label">Доступ</span>
                    <PillToggle
                      compact
                      checked={conversationInfoIsOpen}
                      onCheckedChange={(next) => setConversationInfoIsOpen(next)}
                      offLabel="Закрыто"
                      onLabel="Открыто"
                      ariaLabel="Канал: открыт для всех или только по ссылке"
                      disabled={conversationInfoLoading}
                    />
                  </div>
                </div>
                <div className="messenger-settings-modal__section">
                  <div className="messenger-settings-modal__push-row">
                    <span className="messenger-settings-modal__label">Обсуждение</span>
                    <PillToggle
                      compact
                      checked={conversationInfoChannelComments === 'comments'}
                      onCheckedChange={(next) => setConversationInfoChannelComments(next ? 'comments' : 'reactions_only')}
                      offLabel="Только реакции"
                      onLabel="Комментарии"
                      ariaLabel="Комментарии к постам канала"
                      disabled={conversationInfoLoading}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="messenger-settings-modal__section">
                <span className="messenger-settings-modal__label">Доступ</span>
                <div className="messenger-settings-modal__segment" role="group" aria-label="Доступ">
                  <button
                    type="button"
                    className={`messenger-settings-modal__segment-btn${
                      conversationInfoIsOpen ? ' messenger-settings-modal__segment-btn--active' : ''
                    }`}
                    onClick={() => setConversationInfoIsOpen(true)}
                    disabled={conversationInfoLoading}
                  >
                    Открыто
                  </button>
                  <button
                    type="button"
                    className={`messenger-settings-modal__segment-btn${
                      !conversationInfoIsOpen ? ' messenger-settings-modal__segment-btn--active' : ''
                    }`}
                    onClick={() => setConversationInfoIsOpen(false)}
                    disabled={conversationInfoLoading}
                  >
                    Закрыто
                  </button>
                </div>
              </div>
            )}

            <div className="messenger-settings-modal__section">
              <span className="messenger-settings-modal__label">Логотип</span>
              <input
                type="file"
                accept="image/*"
                disabled={conversationInfoLoading}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null
                  e.target.value = ''
                  setConversationInfoLogoFile(f)
                }}
              />
              {conversationInfoLogoFile ? (
                <p className="messenger-settings-modal__hint">Выбрано: {conversationInfoLogoFile.name}</p>
              ) : (
                <p className="messenger-settings-modal__hint">Опционально.</p>
              )}
            </div>

            {conversationInfoRole && ['owner', 'admin'].includes(conversationInfoRole) ? (
              <div className="messenger-settings-modal__section">
                <span className="messenger-settings-modal__label">Роли и модерация</span>
                <p className="messenger-settings-modal__hint">
                  Назначьте участнику роль модератора или администратора для работы с контентом
                  {c.kind === 'channel'
                    ? ' канала (посты, комментарии, реакции).'
                    : ' группы (настройки по-прежнему только у владельца и админов).'}
                </p>
                {conversationStaffLoading ? (
                  <p className="messenger-settings-modal__hint">Загрузка списка…</p>
                ) : conversationStaffRows.length === 0 ? (
                  <p className="messenger-settings-modal__hint">Нет других участников для назначения.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <select
                      className="dashboard-messenger__list-search-input"
                      value={conversationStaffTargetUserId}
                      onChange={(e) => setConversationStaffTargetUserId(e.target.value)}
                      disabled={conversationInfoLoading || conversationStaffMutating}
                      aria-label="Участник"
                    >
                      <option value="">— Выберите участника —</option>
                      {conversationStaffRows.map((r) => {
                        const disp = messengerContactDisplayName(r.user_id, r.display_name, staffAliasByUserId)
                        const roleBit =
                          r.member_role && r.member_role !== 'member'
                            ? ` (${messengerStaffRoleShortLabel(r.member_role)})`
                            : ''
                        const optLabel = disp.profileName ? `${disp.title} · ${disp.profileName}${roleBit}` : `${disp.title}${roleBit}`
                        return (
                          <option key={r.user_id} value={r.user_id}>
                            {optLabel}
                          </option>
                        )
                      })}
                    </select>
                    <select
                      className="dashboard-messenger__list-search-input"
                      value={conversationStaffNewRole}
                      onChange={(e) => setConversationStaffNewRole(e.target.value as ConversationStaffRole)}
                      disabled={conversationInfoLoading || conversationStaffMutating}
                      aria-label="Новая роль"
                    >
                      <option value="member">Участник</option>
                      <option value="moderator">Модератор</option>
                      <option value="admin" disabled={conversationInfoRole !== 'owner'}>
                        Администратор
                      </option>
                    </select>
                    <button
                      type="button"
                      className="dashboard-topbar__action dashboard-topbar__action--primary"
                      disabled={
                        conversationInfoLoading || conversationStaffMutating || !conversationStaffTargetUserId.trim()
                      }
                      onClick={() => void onApplyStaffRole()}
                    >
                      {conversationStaffMutating ? '…' : 'Назначить или изменить роль'}
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </>
        ) : null}

        {conversationInfoRole ? (
          <div className="messenger-settings-modal__section">
            {leaveError ? <p className="join-error">{leaveError}</p> : null}
            <button
              type="button"
              className="messenger-settings-modal__leave-btn"
              onClick={() => setLeaveConfirmOpen(true)}
              disabled={conversationInfoLoading || leaveBusy}
            >
              {c.kind === 'channel' ? 'Выйти из канала' : 'Выйти из группы'}
            </button>
          </div>
        ) : null}

        <div
          className={`messenger-settings-modal__actions${
            conversationInfoEdit ? ' messenger-settings-modal__actions--split' : ''
          }`}
        >
          {conversationInfoEdit ? (
            <>
              <button type="button" className="dashboard-topbar__action" onClick={onCancelEdit} disabled={conversationInfoLoading}>
                Отмена
              </button>
              <button
                type="button"
                className="messenger-settings-modal__done"
                onClick={() => void onSave()}
                disabled={conversationInfoLoading}
              >
                {conversationInfoLoading ? 'Сохраняем…' : 'Сохранить'}
              </button>
            </>
          ) : (
            <button type="button" className="messenger-settings-modal__done" onClick={onClose}>
              Готово
            </button>
          )}
        </div>

        {leaveConfirmOpen ? (
          <div className="confirm-dialog-root">
            <button
              type="button"
              className="confirm-dialog-backdrop"
              aria-label="Закрыть"
              onClick={() => {
                if (!leaveBusy) setLeaveConfirmOpen(false)
              }}
            />
            <div className="confirm-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ marginTop: 0 }}>{c.kind === 'channel' ? 'Выйти из канала?' : 'Выйти из группы?'}</h3>
              <p className="messenger-settings-modal__hint" style={{ marginTop: 6 }}>
                Вы больше не будете участником и чат исчезнет из списка.
              </p>
              <div className="messenger-settings-modal__actions messenger-settings-modal__actions--split">
                <button
                  type="button"
                  className="dashboard-topbar__action"
                  disabled={leaveBusy}
                  onClick={() => setLeaveConfirmOpen(false)}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  className="dashboard-topbar__action dashboard-topbar__action--primary"
                  disabled={leaveBusy}
                  onClick={() => void onLeaveConfirm()}
                >
                  {leaveBusy ? '…' : 'Выйти'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
