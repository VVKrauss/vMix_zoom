import { SignJWT, jwtVerify } from 'jose'
import { readEnv } from '../env.js'

const textEncoder = new TextEncoder()

export type AccessClaims = {
  sub: string
  email?: string | null
  displayName?: string | null
}

export async function signAccessToken(claims: AccessClaims): Promise<string> {
  const env = readEnv()
  const secret = textEncoder.encode(env.JWT_ACCESS_SECRET)
  const now = Math.floor(Date.now() / 1000)
  return await new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(env.JWT_ISSUER)
    .setIssuedAt(now)
    .setExpirationTime(now + env.ACCESS_TTL_SEC)
    .sign(secret)
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  const env = readEnv()
  const secret = textEncoder.encode(env.JWT_ACCESS_SECRET)
  const { payload } = await jwtVerify(token, secret, { issuer: env.JWT_ISSUER })
  const sub = typeof payload.sub === 'string' ? payload.sub : ''
  if (!sub) throw new Error('Invalid token: sub')
  return {
    sub,
    email: typeof (payload as any).email === 'string' ? String((payload as any).email) : null,
    displayName:
      typeof (payload as any).displayName === 'string' ? String((payload as any).displayName) : null,
  }
}

import crypto from 'node:crypto'

export function sha256Base64Url(input: string): string {
  const hash = crypto.createHash('sha256').update(input, 'utf8').digest()
  return hash.toString('base64url')
}

export function newOpaqueToken(bytes = 48): string {
  return crypto.randomBytes(bytes).toString('base64url')
}

