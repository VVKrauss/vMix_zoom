import { cloneElement, Fragment, isValidElement, useMemo, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import { Link } from 'react-router-dom'
import { normalizeProfileSlug, validateProfileSlugInput } from '../lib/profileSlug'
import { MessengerInlineInviteCard } from './messenger/MessengerInlineInviteCard'
import { MessengerInlineRoomInviteCard } from './messenger/MessengerInlineRoomInviteCard'

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

function mentionButtonIfAt(
  text: string,
  i: number,
  onMentionSlug: (slug: string) => void,
  reactKey: number,
): { el: ReactNode; advance: number } | null {
  const sub = text.slice(i)
  if (sub[0] !== '@') return null
  const boundaryOk = i === 0 || /\s/.test(text[i - 1]!)
  if (!boundaryOk) return null
  const atM = /^@([a-zA-Z0-9](?:[a-zA-Z0-9_-]*[a-zA-Z0-9])?)/.exec(sub)
  if (!atM || !atM[1] || atM[1].length < 3 || validateProfileSlugInput(atM[1]) !== null) return null
  const raw = atM[1]
  const slug = normalizeProfileSlug(raw)
  const display = `@${raw}`
  return {
    el: (
      <button
        key={reactKey}
        type="button"
        className="messenger-message-link messenger-message-mention"
        onClick={(e) => {
          e.preventDefault()
          onMentionSlug(slug)
        }}
      >
        {display}
      </button>
    ),
    advance: display.length,
  }
}

function buildChildren(text: string, onMentionSlug?: (slug: string) => void): ReactNode[] {
  const nodes: ReactNode[] = []
  let i = 0
  let k = 0
  const n = text.length

  while (i < n) {
    const sub = text.slice(i)
    if (onMentionSlug) {
      const m = mentionButtonIfAt(text, i, onMentionSlug, k)
      if (m) {
        nodes.push(m.el)
        k += 1
        i += m.advance
        continue
      }
    }
    const inv = INVITE_AT_START.exec(sub)
    if (inv && inv.index === 0) {
      const full = inv[0]
      const roomId = inv[1].trim()
      const bracketPos = full.indexOf('[')
      const prefix = bracketPos >= 0 ? full.slice(0, bracketPos) : full
      if (roomId) {
        nodes.push(<span key={k}>{prefix}</span>)
        k += 1
        nodes.push(<MessengerInlineRoomInviteCard key={k} roomId={roomId} />)
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
      // Без маркеров ссылок весь хвост нельзя класть одним span — иначе «текст @nick»
      // никогда не проходит через ветку @ выше (она срабатывает только у sub[0]==='@').
      while (i < n) {
        const tail = text.slice(i)
        if (onMentionSlug) {
          const m = mentionButtonIfAt(text, i, onMentionSlug, k)
          if (m) {
            nodes.push(m.el)
            k += 1
            i += m.advance
            continue
          }
        }
        const nextAt = tail.indexOf('@', 1)
        if (nextAt === -1) {
          nodes.push(<span key={k}>{tail}</span>)
          break
        }
        if (nextAt > 0) {
          nodes.push(<span key={k}>{text.slice(i, i + nextAt)}</span>)
          k += 1
          i += nextAt
          continue
        }
        nodes.push(<span key={k}>{text[i]}</span>)
        k += 1
        i += 1
      }
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

function shouldSkipMentionScanInTree(node: ReactNode): boolean {
  if (!isValidElement(node)) return false
  const t = node.type
  if (t === 'code' || t === 'pre' || t === 'kbd' || t === 'samp') return true
  return false
}

/**
 * После ReactMarkdown: разбить текстовые узлы на @упоминания (как в {@link MessengerMessageBody}).
 * Пропускает inline/block code — там «@» не считается mention.
 */
export function injectMentionsInReactTree(node: ReactNode, onMentionSlug?: (slug: string) => void): ReactNode {
  if (!onMentionSlug) return node
  if (node == null || typeof node === 'boolean') return node
  if (typeof node === 'string' || typeof node === 'number') {
    const s = String(node)
    const parts = buildChildren(s, onMentionSlug)
    if (parts.length === 0) return node
    if (parts.length === 1) return parts[0]
    return <Fragment>{parts}</Fragment>
  }
  if (Array.isArray(node)) {
    return node.map((n, i) => (
      <Fragment key={i}>{injectMentionsInReactTree(n, onMentionSlug)}</Fragment>
    ))
  }
  if (isValidElement(node)) {
    if (shouldSkipMentionScanInTree(node)) return node
    // react-markdown v10+: `children` must be the markdown source string; do not replace with React nodes.
    if (node.type === ReactMarkdown) return node
    const ch = (node.props as { children?: ReactNode }).children
    if (ch === undefined) return node
    const next = injectMentionsInReactTree(ch, onMentionSlug)
    if (next === ch) return node
    return cloneElement(node, { children: next } as never)
  }
  return node
}

/** Текст сообщения: ссылки, приглашение в комнату, ссылка-приглашение в мессенджер. */
export function MessengerMessageBody({
  text,
  onMentionSlug,
  className,
}: {
  text: string
  /** Клик по @nickname — открыть профиль (slug уже нормализован). */
  onMentionSlug?: (slug: string) => void
  className?: string
}) {
  const children = useMemo(() => buildChildren(text, onMentionSlug), [text, onMentionSlug])
  if (!className) return <>{children}</>
  return <span className={className}>{children}</span>
}
