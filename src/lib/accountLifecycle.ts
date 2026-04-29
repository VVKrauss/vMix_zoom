import { v1DeleteMyAccount } from '../api/accountApi'

export async function deleteMyAccount(): Promise<{ ok: boolean; error?: string }> {
  return await v1DeleteMyAccount()
}
