import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { useProfileData, type UseProfileReturn } from '../hooks/useProfileData'
import { usePresenceSession } from '../hooks/usePresenceSession'
import { ProfileEditModalHost } from '../components/ProfileEditModalHost'

export type { PlanInfo, UserGlobalRole, UserProfile } from '../hooks/useProfileData'

export type ProfileContextValue = UseProfileReturn & {
  profileEditOpen: boolean
  openProfileEdit: () => void
  closeProfileEdit: () => void
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

function PresenceSessionHost() {
  usePresenceSession()
  return null
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const data = useProfileData()
  const [profileEditOpen, setProfileEditOpen] = useState(false)
  const openProfileEdit = useCallback(() => setProfileEditOpen(true), [])
  const closeProfileEdit = useCallback(() => setProfileEditOpen(false), [])

  const value: ProfileContextValue = {
    ...data,
    profileEditOpen,
    openProfileEdit,
    closeProfileEdit,
  }

  return (
    <ProfileContext.Provider value={value}>
      <PresenceSessionHost />
      {children}
      <ProfileEditModalHost
        open={profileEditOpen}
        onClose={closeProfileEdit}
        api={data}
        requestOpen={openProfileEdit}
      />
    </ProfileContext.Provider>
  )
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext)
  if (!ctx) {
    throw new Error('useProfile must be used within ProfileProvider')
  }
  return ctx
}
