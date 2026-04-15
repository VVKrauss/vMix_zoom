/* Доп. скрипт service worker: push + клик по уведомлению (подключается из workbox importScripts). */
self.addEventListener('push', (event) => {
  let title = 'redflow.online'
  let body = 'Новое сообщение'
  let url = '/dashboard/messenger'
  let tag = 'dm'
  let icon = '/logo.png'
  let badge = '/logo.png'
  let conversationId = ''
  let image = ''
  try {
    const t = event.data && event.data.text && event.data.text()
    if (t) {
      const j = JSON.parse(t)
      if (typeof j.title === 'string' && j.title.trim()) title = j.title.trim()
      if (typeof j.body === 'string') body = j.body
      if (typeof j.url === 'string' && j.url.trim()) url = j.url.trim()
      if (typeof j.tag === 'string' && j.tag.trim()) tag = j.tag.trim()
      if (typeof j.icon === 'string' && j.icon.trim()) icon = j.icon.trim()
      if (typeof j.badge === 'string' && j.badge.trim()) badge = j.badge.trim()
      if (typeof j.conversationId === 'string' && j.conversationId.trim()) conversationId = j.conversationId.trim()
      if (typeof j.image === 'string' && j.image.trim()) image = j.image.trim()
    }
  } catch (_) {
    /* text() не JSON — показываем дефолт */
  }
  event.waitUntil(
    (async () => {
      // Если вкладка с тем же чатом уже открыта и активна — push не нужен.
      if (conversationId) {
        const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        for (const c of list) {
          try {
            if (c.visibilityState !== 'visible') continue
            const u = new URL(c.url)
            if (u.pathname.startsWith('/dashboard/messenger')) {
              const seg = u.pathname.split('/').filter(Boolean)
              const inPath = seg.length >= 3 && seg[0] === 'dashboard' && seg[1] === 'messenger' ? seg[2] : ''
              const inQuery = u.searchParams.get('chat')?.trim() ?? ''
              const openId = inPath || inQuery
              if (openId && openId === conversationId) return
            }
          } catch (_) {
            /* ignore parse */
          }
        }
      }
      // iOS PWA: часто игнорирует NotificationOptions.icon (в пользу иконки из manifest).
      // Показываем аватар хотя бы как "image" (если поддерживается) и ставим бейдж на иконку приложения.
      try {
        if (self.navigator && typeof self.navigator.setAppBadge === 'function') {
          await self.navigator.setAppBadge(1)
        }
      } catch (_) {
        /* ignore */
      }
      await self.registration.showNotification(title, {
        body,
        icon,
        badge,
        image: image || undefined,
        tag,
        renotify: true,
        data: { url, conversationId },
      })
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const raw = event.notification && event.notification.data && event.notification.data.url
  const path = typeof raw === 'string' && raw.trim() ? raw.trim() : '/dashboard/messenger'
  const targetUrl = path.startsWith('http') ? path : new URL(path, self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (let i = 0; i < clientList.length; i++) {
        const c = clientList[i]
        if (c.url.startsWith(self.location.origin) && 'navigate' in c && typeof c.navigate === 'function') {
          return c.navigate(targetUrl).then(() => c.focus())
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
    }),
  )
})
