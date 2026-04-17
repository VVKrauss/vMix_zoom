import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { MessengerInlineInviteCard } from './messenger/MessengerInlineInviteCard'

const INVITE_AT_START = /^Приглашаю в комнату:\s*\[([^\]]+)\]/
const URL_AT_START = /^(https?:\/\/[^\s<>\]]+|www\.[^\s<>\]]+)/i
const PATH_MESSENGER_INVITE = /^\/dashboard\/messenger(?:\?[^\s#]*)?(?:[#][^\s]*)?/i
const PATH_INTERNAL_AT_START = /^\/(?:dashboard|r)\/[^\s#]+(?:\?[^\s#]*)?(?:[#][^\s]*)?/i

function trimTrailingUrlPunct(s: string): string {
  return s.replace(/[.,;:!?)]+$/, '')
}

function internalToFromHref(rawHref: string): string | null {
  const href = trimTrailingUrlPunct(rawHref || '')
  if (!href) return null
  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const base = origin || 'http://localhost'
    const abs = /^https?:\/\//i.test(href) ? new URL(href) : href.startsWith('/') ? new URL(href, base) : null
    if (!abs) return null
    if (origin && abs.origin !== origin) return null
    const path = abs.pathname || '/'
    if (!path.startsWith('/dashboard/') && !path.startsWith('/r/')) return null
    return `${path}${abs.search || ''}${abs.hash || ''}`
  } catch {
    return null
  }
}

function parseMessengerInviteFromRawUrl(rawFull: string): { token: string } | null {
  const raw = trimTrailingUrlPunct(rawFull)
  if (!raw) return null
  try {
    const abs = /^https?:\/\//i.test(raw)
      ? new URL(raw)
      : new URL(raw.startsWith('/') ? raw : `/${raw}`, 'http://localhost')
    const norm = (abs.pathname || '/').replace(/\/+$/, '') || '/'
    if (norm !== '/dashboard/messenger') return null
    const inv = abs.searchParams.get('invite')?.trim()
    if (!inv) return null
    return { token: inv }
  } catch {
    return null
  }
}

function buildChildren(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let i = 0
  let k = 0
  const n = text.length

  while (i < n) {
    const sub = text.slice(i)
    const inv = INVITE_AT_START.exec(sub)
    if (inv && inv.index === 0) {
      const full = inv[0]
      const roomId = inv[1].trim()
      const bracketPos = full.indexOf('[')
      const prefix = bracketPos >= 0 ? full.slice(0, bracketPos) : full
      if (roomId) {
        const to = `/r/${encodeURIComponent(roomId)}`
        nodes.push(<span key={k}>{prefix}</span>)
        k += 1
        nodes.push(
          <Link key={k} to={to} className="messenger-message-link">
            [{roomId}]
          </Link>,
        )
        k += 1
      } else {
        nodes.push(<span key={k}>{full}</span>)
        k += 1
      }
      i += full.length
      continue
    }

    const pathM = PATH_MESSENGER_INVITE.exec(sub)
    if (pathM && pathM.index === 0) {
      const chunk = pathM[0]
      const parsed = parseMessengerInviteFromRawUrl(chunk)
      if (parsed) {
        nodes.push(<MessengerInlineInviteCard key={k} inviteToken={parsed.token} />)
        k += 1
      } else {
        const to = internalToFromHref(chunk)
        nodes.push(
          to ? (
            <Link key={k} to={to} className="messenger-message-link">
              {chunk}
            </Link>
          ) : (
            <span key={k}>{chunk}</span>
          ),
        )
        k += 1
      }
      i += chunk.length
      continue
    }

    const internalM = PATH_INTERNAL_AT_START.exec(sub)
    if (internalM && internalM.index === 0) {
      const rawFull = internalM[0]
      const adv = rawFull.length
      const chunk = trimTrailingUrlPunct(rawFull)
      const to = internalToFromHref(chunk)
      if (to) {
        nodes.push(
          <Link key={k} to={to} className="messenger-message-link">
            {chunk}
          </Link>,
        )
      } else {
        nodes.push(<span key={k}>{chunk}</span>)
      }
      k += 1
      i += adv
      continue
    }

    const um = URL_AT_START.exec(sub)
    if (um && um.index === 0) {
      const rawFull = um[0]
      const adv = rawFull.length
      const raw = trimTrailingUrlPunct(rawFull)
      const inviteParsed = parseMessengerInviteFromRawUrl(rawFull)
      if (inviteParsed) {
        nodes.push(<MessengerInlineInviteCard key={k} inviteToken={inviteParsed.token} />)
        k += 1
        i += adv
        continue
      }
      const href = /^www\./i.test(raw) ? `https://${raw}` : raw
      const to = internalToFromHref(href)
      nodes.push(
        to ? (
          <Link key={k} to={to} className="messenger-message-link">
            {raw}
          </Link>
        ) : (
          <a key={k} href={href} className="messenger-message-link" target="_blank" rel="noopener noreferrer">
            {raw}
          </a>
        ),
      )
      k += 1
      i += adv
      continue
    }

    const rel = sub.search(/https?:\/\/|www\.|\/dashboard\/|\/r\/|Приглашаю в комнату:/)
    if (rel === -1) {
      nodes.push(<span key={k}>{text.slice(i)}</span>)
      break
    }
    if (rel > 0) {
      nodes.push(<span key={k}>{text.slice(i, i + rel)}</span>)
      k += 1
      i += rel
      continue
    }

    if (sub.startsWith('Приглашаю в комнату:')) {
      const lineEnd = sub.indexOf('\n')
      const chunk = lineEnd >= 0 ? sub.slice(0, lineEnd) : sub.slice(0, Math.min(160, sub.length))
      if (chunk.length > 0) {
        nodes.push(<span key={k}>{chunk}</span>)
        k += 1
        i += chunk.length
        continue
      }
    }

    nodes.push(<span key={k}>{text[i]}</span>)
    k += 1
    i += 1
  }

  return nodes
}

/** Текст сообщения: ссылки, приглашение в комнату, ссылка-приглашение в мессенджер. */
export function MessengerMessageBody({ text }: { text: string }) {
  const children = useMemo(() => buildChildren(text), [text])
  return <>{children}</>
}
