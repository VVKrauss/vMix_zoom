import { apiBase, fetchJson, type ApiResult } from './http'

export async function storageUpload(params: {
  bucket: 'avatars' | 'messenger-media'
  path: string
  file: Blob
  contentType?: string
  upsert?: boolean
}): Promise<ApiResult<{ ok: true }>> {
  const base = apiBase()
  const url = `${base}/api/storage/upload`
  const form = new FormData()
  form.set('bucket', params.bucket)
  form.set('path', params.path)
  form.set('upsert', params.upsert === false ? '0' : '1')
  form.set('file', params.file)
  // Use fetchJson to attach Authorization header and support auto-refresh on 401.
  return await fetchJson('/api/storage/upload', { method: 'POST', auth: true, body: form as any })
}

export async function storageGetPublicUrl(params: {
  bucket: 'avatars'
  path: string
}): Promise<string> {
  // backend должен уметь отдавать публичный URL, но для аватаров обычно достаточно CDN path.
  // Здесь оставляем простой детерминированный URL.
  const base = apiBase()
  const encPath = params.path.split('/').map(encodeURIComponent).join('/')
  return `${base}/public/${params.bucket}/${encPath}`
}

export async function storageGetSignedUrl(params: {
  bucket: 'messenger-media'
  path: string
  expiresInSec?: number
}): Promise<ApiResult<{ signedUrl: string }>> {
  return await fetchJson('/api/storage/signed-url', {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ ...params, expiresInSec: params.expiresInSec ?? 60 }),
  })
}

export async function storageRemove(params: {
  bucket: 'avatars' | 'messenger-media'
  paths: string[]
}): Promise<ApiResult<{ ok: true }>> {
  return await fetchJson('/api/storage/remove', {
    method: 'POST',
    auth: true,
    body: JSON.stringify(params),
  })
}

