import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../hooks/useProfile'
import { ConfirmDialog } from './ConfirmDialog'
import { legacyRpc } from '../api/legacyRpcApi'

export type AdminUserRow = {
  id: string
  email: string | null
  display_name: string | null
  status: string
  created_at: string | null
  global_roles: string[] | null
}

/** Один выбранный уровень доступа (в БД может остаться и registered_user у админов). */
export type AccessPreset = 'registered' | 'support_admin' | 'platform_admin' | 'superadmin'

type SetRoleResult = { ok?: boolean; error?: string }

type DeleteUserResult = { ok?: boolean; error?: string; detail?: string }

const STAFF_CODES = ['superadmin', 'platform_admin', 'support_admin'] as const

/** Максимальный уровень staff у пользователя (0 = только обычный user). */
function maxStaffRank(codes: string[] | null): number {
  const s = new Set(codes ?? [])
  if (s.has('superadmin')) return 3
  if (s.has('platform_admin')) return 2
  if (s.has('support_admin')) return 1
  return 0
}

function presetFromRoles(codes: string[]): AccessPreset {
  const c = new Set(codes ?? [])
  if (c.has('superadmin')) return 'superadmin'
  if (c.has('platform_admin')) return 'platform_admin'
  if (c.has('support_admin')) return 'support_admin'
  return 'registered'
}

/** Короткая подпись на кнопке: user / admin (и отдельно супер). */
function accessButtonLabel(preset: AccessPreset): string {
  switch (preset) {
    case 'superadmin':
      return 'superadmin'
    case 'platform_admin':
    case 'support_admin':
      return 'admin'
    case 'registered':
    default:
      return 'user'
  }
}

const MENU_OPTIONS: { preset: AccessPreset; label: string; requiresSuperViewer?: boolean }[] = [
  { preset: 'registered', label: 'Пользователь (user)' },
  { preset: 'support_admin', label: 'Поддержка (admin)' },
  { preset: 'platform_admin', label: 'Админ платформы (admin)' },
  { preset: 'superadmin', label: 'Суперадмин', requiresSuperViewer: true },
]

async function rpcSetRole(
  userId: string,
  code: string,
  grant: boolean,
): Promise<string | null> {
  const r = await legacyRpc('admin_set_user_global_role', { p_target_user: userId, p_role_code: code, p_grant: grant })
  if (r.error) return r.error
  const data = r.data
  const res = data as SetRoleResult | null
  if (!res?.ok) {
    if (res?.error === 'only_superadmin') {
      return 'Только суперадмин может назначать роль «Суперадмин».'
    }
    if (res?.error === 'forbidden') return 'Нет прав.'
    if (res?.error === 'unknown_role') return 'Неизвестная роль.'
    return 'Не удалось сохранить.'
  }
  return null
}

async function rpcDeleteUser(userId: string): Promise<string | null> {
  const r = await legacyRpc('admin_delete_registered_user', { p_target_user: userId })
  if (r.error) return r.error
  const data = r.data
  const res = data as DeleteUserResult | null
  if (!res?.ok) {
    switch (res?.error) {
      case 'forbidden':
        return 'Нет прав.'
      case 'cannot_delete_self':
        return 'Нельзя удалить свою учётную запись.'
      case 'user_not_found':
        return 'Пользователь не найден.'
      case 'cannot_delete_staff':
      case 'cannot_delete_peer':
        return 'Недостаточно прав для удаления этого пользователя.'
      case 'delete_failed':
        return res.detail ? `Ошибка: ${res.detail}` : 'Не удалось удалить пользователя.'
      default:
        return 'Не удалось удалить пользователя.'
    }
  }
  return null
}

export function AdminRegisteredUsersTable({ isSuperadmin }: { isSuperadmin: boolean }) {
  const { user } = useAuth()
  const { profile, loading: profileLoading } = useProfile()
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingUserId, setPendingUserId] = useState<string | null>(null)
  const [openUserId, setOpenUserId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminUserRow | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const callerId = user?.id ?? profile?.id ?? ''
  const callerRank = profile ? maxStaffRank(profile.global_roles.map((r) => r.code)) : null

  const rowCanDelete = useCallback(
    (row: AdminUserRow) => {
      if (!callerId || row.id === callerId) return false
      if (profileLoading || callerRank === null) return true
      const tr = maxStaffRank(row.global_roles)
      if (callerRank === 1 && tr > 0) return false
      if (callerRank === 2 && tr > 1) return false
      return callerRank >= 1
    },
    [callerId, callerRank, profileLoading],
  )

  const refresh = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    setError(null)
    const uRes = await legacyRpc('admin_list_registered_users', { p_limit: 200, p_offset: 0 })
    if (uRes.error) {
      setError(uRes.error)
      setUsers([])
    } else {
      setUsers((uRes.data as AdminUserRow[] | null) ?? [])
    }
    if (showLoading) setLoading(false)
  }, [])

  useEffect(() => {
    void refresh(true)
  }, [refresh])

  const applyPreset = async (userId: string, target: AccessPreset) => {
    if (!isSuperadmin && target === 'superadmin') return
    setPendingUserId(userId)
    setError(null)
    setOpenUserId(null)

    for (const code of STAFF_CODES) {
      const err = await rpcSetRole(userId, code, false)
      if (err) {
        setError(err)
        setPendingUserId(null)
        return
      }
    }

    if (target === 'registered') {
      const err = await rpcSetRole(userId, 'registered_user', true)
      if (err) {
        setError(err)
        setPendingUserId(null)
        return
      }
    } else {
      const code =
        target === 'support_admin'
          ? 'support_admin'
          : target === 'platform_admin'
            ? 'platform_admin'
            : 'superadmin'
      const err = await rpcSetRole(userId, code, true)
      if (err) {
        setError(err)
        setPendingUserId(null)
        return
      }
    }

    setPendingUserId(null)
    await refresh(false)
  }

  const runDelete = useCallback(() => {
    if (!deleteTarget || deleteBusy) return
    setDeleteBusy(true)
    setError(null)
    void (async () => {
      const err = await rpcDeleteUser(deleteTarget.id)
      setDeleteBusy(false)
      setDeleteTarget(null)
      if (err) setError(err)
      else await refresh(false)
    })()
  }, [deleteBusy, deleteTarget, refresh])

  if (loading) {
    return <p className="admin-users-loading">Загрузка списка…</p>
  }

  if (error && users.length === 0) {
    return <p className="join-error admin-users-error">{error}</p>
  }

  return (
    <div className="admin-users-wrap">
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Удалить пользователя?"
        message={
          deleteTarget
            ? `Будут безвозвратно удалены учётная запись и связанные данные (аккаунты-владельца, комнаты, сессии и т.д.): ${deleteTarget.email ?? deleteTarget.display_name ?? deleteTarget.id}.`
            : ''
        }
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        confirmLoading={deleteBusy}
        onConfirm={runDelete}
        onCancel={() => {
          if (!deleteBusy) setDeleteTarget(null)
        }}
      />
      {error ? <p className="join-error admin-users-flash">{error}</p> : null}
      <p className="dashboard-section__hint admin-users-hint">
        Уровень доступа: нажмите на <strong>user</strong> / <strong>admin</strong> / <strong>superadmin</strong>, чтобы открыть список и сменить роль. Удаление: поддержка — только обычные пользователи; админ платформы — и поддержку; суперадмин — всех кроме себя.
      </p>
      <div className="admin-users-table-shell">
        <table className="admin-users-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Имя</th>
              <th>Статус</th>
              <th>Доступ</th>
              <th className="admin-users-table__th-actions"> </th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={5} className="admin-users-table__empty">
                  Нет пользователей или нет доступа к списку.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id}>
                  <td className="admin-users-table__cell admin-users-table__cell--email" title={u.email ?? ''}>
                    {u.email ?? '—'}
                  </td>
                  <td className="admin-users-table__cell admin-users-table__cell--name" title={u.display_name ?? ''}>
                    {u.display_name ?? '—'}
                  </td>
                  <td className="admin-users-table__cell admin-users-table__cell--status">{u.status}</td>
                  <td className="admin-users-table__cell admin-users-table__cell--access">
                    <RoleAccessPicker
                      preset={presetFromRoles(u.global_roles ?? [])}
                      busy={pendingUserId === u.id}
                      open={openUserId === u.id}
                      onOpenChange={(o) => setOpenUserId(o ? u.id : null)}
                      isSuperadmin={isSuperadmin}
                      onPick={(p) => void applyPreset(u.id, p)}
                    />
                  </td>
                  <td className="admin-users-table__cell admin-users-table__cell--actions">
                    {rowCanDelete(u) ? (
                      <button
                        type="button"
                        className="admin-users-delete-btn"
                        disabled={pendingUserId !== null || deleteBusy}
                        onClick={() => setDeleteTarget(u)}
                      >
                        Удалить
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RoleAccessPicker({
  preset,
  busy,
  open,
  onOpenChange,
  isSuperadmin,
  onPick,
}: {
  preset: AccessPreset
  busy: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  isSuperadmin: boolean
  onPick: (p: AccessPreset) => void
}) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const [menuPlace, setMenuPlace] = useState<{ top: number; right: number } | null>(null)

  const label = accessButtonLabel(preset)

  useLayoutEffect(() => {
    if (!open || busy) {
      setMenuPlace(null)
      return
    }
    const update = () => {
      const el = triggerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setMenuPlace({ top: r.bottom + 6, right: window.innerWidth - r.right })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open, busy])

  useEffect(() => {
    if (!open || busy) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return
      onOpenChange(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, busy, onOpenChange])

  const menu =
    open && !busy && menuPlace ? (
      <ul
        ref={menuRef}
        className="admin-role-picker__menu admin-role-picker__menu--portal"
        style={{ top: menuPlace.top, right: menuPlace.right }}
        role="listbox"
      >
        {MENU_OPTIONS.map((opt) => {
          if (opt.requiresSuperViewer && !isSuperadmin) return null
          const active = opt.preset === preset
          return (
            <li key={opt.preset} role="none">
              <button
                type="button"
                role="option"
                aria-selected={active}
                className={`admin-role-picker__option${active ? ' admin-role-picker__option--active' : ''}`}
                onClick={() => onPick(opt.preset)}
              >
                {opt.label}
              </button>
            </li>
          )
        })}
      </ul>
    ) : null

  return (
    <div className="admin-role-picker">
      <button
        ref={triggerRef}
        type="button"
        className={`admin-role-picker__trigger${open ? ' admin-role-picker__trigger--open' : ''}`}
        disabled={busy}
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Уровень доступа: ${label}`}
      >
        {busy ? '…' : label}
      </button>
      {menu ? createPortal(menu, document.body) : null}
    </div>
  )
}
