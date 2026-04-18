import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { deleteMyAccount } from '../lib/accountLifecycle'
import { normalizeProfileSlug, validateProfileSlugInput } from '../lib/profileSlug'
import type { UseProfileReturn } from '../hooks/useProfileData'
import type { ProfileSlugAvailability } from './DashboardProfileModal'
import { DashboardProfileModal } from './DashboardProfileModal'
import { ConfirmDialog } from './ConfirmDialog'

const PROFILE_AUTOSAVE_MS = 650

export function ProfileEditModalHost({
  open,
  onClose,
  api,
  requestOpen,
}: {
  open: boolean
  onClose: () => void
  api: UseProfileReturn
  requestOpen: () => void
}) {
  const { signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const {
    profile,
    saving,
    uploadingAvatar,
    saveProfile,
    uploadAvatar,
    removeAvatar,
    checkProfileSlugAvailable,
  } = api

  const [displayName, setDisplayName] = useState('')
  const [profileSlug, setProfileSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [nameEdited, setNameEdited] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteErr, setDeleteErr] = useState<string | null>(null)
  const [slugAvailability, setSlugAvailability] = useState<ProfileSlugAvailability>('idle')
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const st = location.state as { openProfileEdit?: boolean } | null | undefined
    if (!st?.openProfileEdit) return
    navigate(`${location.pathname}${location.search}`, { replace: true, state: {} })
    requestOpen()
  }, [location.state, location.pathname, location.search, navigate, requestOpen])

  useEffect(() => {
    if (!open || !profile) return
    setDisplayName(profile.display_name)
    setProfileSlug(profile.profile_slug ?? '')
    setSlugEdited(false)
    setNameEdited(false)
    setSaveErr(null)
  }, [open, profile])

  const currentName = nameEdited ? displayName : (profile?.display_name ?? '')
  const currentSlug = slugEdited ? profileSlug : (profile?.profile_slug ?? '')

  useEffect(() => {
    if (!open || !profile) {
      setSlugAvailability('idle')
      return
    }
    const raw = currentSlug.trim()
    if (!raw) {
      setSlugAvailability('free')
      return
    }
    const vErr = validateProfileSlugInput(raw)
    if (vErr) {
      setSlugAvailability('invalid')
      return
    }
    const normalized = normalizeProfileSlug(raw)
    if (normalized === (profile.profile_slug ?? '')) {
      setSlugAvailability('free')
      return
    }
    setSlugAvailability('checking')
    const t = window.setTimeout(() => {
      void checkProfileSlugAvailable(raw).then((ok) => {
        setSlugAvailability(ok ? 'free' : 'taken')
      })
    }, 380)
    return () => window.clearTimeout(t)
  }, [open, profile, currentSlug, checkProfileSlugAvailable])

  const flushAutosave = useCallback(async () => {
    if (!profile) return
    if (!currentName.trim()) return
    if (slugAvailability === 'checking' || slugAvailability === 'taken' || slugAvailability === 'invalid') return
    setSaveErr(null)
    const { error: err } = await saveProfile(currentName, currentSlug)
    if (err) setSaveErr(err)
    else {
      setSlugEdited(false)
      setNameEdited(false)
    }
  }, [profile, currentName, currentSlug, slugAvailability, saveProfile])

  useEffect(() => {
    if (!open || !profile) return
    if (!nameEdited && !slugEdited) return
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null
      void flushAutosave()
    }, PROFILE_AUTOSAVE_MS)
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    }
  }, [open, profile, nameEdited, slugEdited, displayName, profileSlug, flushAutosave])

  const handleNameChange = (value: string) => {
    setDisplayName(value)
    setNameEdited(true)
    setSaveErr(null)
  }

  const handleSlugChange = (value: string) => {
    setProfileSlug(value)
    setSlugEdited(true)
    setSaveErr(null)
  }

  const handleModalAvatarUpload = async (file: File) => {
    setSaveErr(null)
    const { error: err } = await uploadAvatar(file)
    if (err) setSaveErr(err)
  }

  const handleRemoveAvatar = async () => {
    setSaveErr(null)
    const { error: err } = await removeAvatar()
    if (err) setSaveErr(err)
  }

  const closeModal = useCallback(async () => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
    await flushAutosave()
    onClose()
    setSaveErr(null)
  }, [flushAutosave, onClose])

  const initials = (profile?.display_name ?? '?').charAt(0).toUpperCase()

  if (!profile) return null

  return (
    <>
      <DashboardProfileModal
        open={open}
        onClose={closeModal}
        displayName={currentName}
        onDisplayNameChange={handleNameChange}
        profileSlug={currentSlug}
        onProfileSlugChange={handleSlugChange}
        currentName={currentName}
        email={profile.email ?? ''}
        avatarUrl={profile.avatar_url}
        avatarAlt={profile.display_name}
        initials={initials}
        saving={saving}
        uploadingAvatar={uploadingAvatar}
        saveErr={saveErr}
        onRemoveAvatar={() => {
          void handleRemoveAvatar()
        }}
        onUploadAvatar={(file) => {
          void handleModalAvatarUpload(file)
        }}
        slugAvailability={slugAvailability}
        onDeleteAccountClick={() => {
          setDeleteErr(null)
          setDeleteConfirmOpen(true)
        }}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Удалить аккаунт?"
        message={
          <>
            <p>
              Аккаунт и связанные данные будут удалены без возможности восстановления: комнаты, материалы, переписки и
              подписки в рамках этого профиля.
            </p>
            <p style={{ marginTop: '0.75rem' }}>Продолжить?</p>
            {deleteErr ? <p className="join-error">{deleteErr}</p> : null}
          </>
        }
        confirmLabel="Удалить навсегда"
        cancelLabel="Отмена"
        confirmLoading={deleteBusy}
        onCancel={() => {
          if (!deleteBusy) setDeleteConfirmOpen(false)
        }}
        onConfirm={() => {
          void (async () => {
            setDeleteErr(null)
            setDeleteBusy(true)
            const res = await deleteMyAccount()
            setDeleteBusy(false)
            if (!res.ok) {
              setDeleteErr(res.error ?? 'Не удалось удалить аккаунт')
              return
            }
            setDeleteConfirmOpen(false)
            closeModal()
            await signOut()
          })()
        }}
      />
    </>
  )
}
