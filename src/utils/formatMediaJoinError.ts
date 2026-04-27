/**
 * Человекочитаемые сообщения вместо сырого DOMException / Error на экране входа.
 */
export function formatMediaJoinError(err: unknown): string {
  if (err instanceof DOMException) {
    switch (err.name) {
      case 'NotAllowedError':
        return (
          'Нет доступа к микрофону или камере. Разрешите их для этого сайта ' +
          '(в Safari: «Аа» слева от адреса → настройки сайта) либо выключите микрофон и камеру ниже и войдите без них.'
        )
      case 'NotFoundError':
        return 'Микрофон или камера не найдены. Подключите устройство или войдите с выключенными микрофоном и камерой.'
      case 'NotReadableError':
        return (
          'Не удалось захватить камеру или микрофон. Иногда Safari на iPhone показывает это даже когда камера не занята: ' +
          'попробуйте перезагрузить страницу, закрыть другие вкладки с камерой и войти снова (или войти без камеры/микрофона).'
        )
      case 'OverconstrainedError':
        return 'Камера не подходит по настройкам. Выключите камеру на экране входа или выберите другое устройство.'
      case 'SecurityError':
        return 'Браузер не даёт доступ к камере и микрофону на этой странице (нужен защищённый адрес HTTPS).'
      case 'AbortError':
        return 'Запрос к устройству прерван. Нажмите «Войти» ещё раз.'
      default:
        break
    }
  }

  if (err instanceof Error) {
    const msg = err.message
    if (msg === 'aborted') {
      return 'Подключение отменено.'
    }
    if (/websocket error|xhr poll error|transport|ECONNREFUSED|NetworkError|Failed to fetch|network/i.test(msg)) {
      return 'Не удалось подключиться к серверу. Проверьте сеть и попробуйте снова.'
    }
  }

  return 'Не удалось войти в комнату. Попробуйте ещё раз.'
}

/** Ошибки produce/трека студии — не путать с join (иначе показывается «не удалось войти»). */
export function formatStudioProgramError(err: unknown): string {
  if (err instanceof DOMException) {
    const m = err.message
    if (m) return m
  }
  if (err instanceof Error) {
    const m = err.message
    if (m === 'aborted') return 'Подключение прервано.'
    if (/track ended|ended/i.test(m)) {
      return (
        'Видеотрек студии уже завершён (часто из‑за перерисовки canvas или повторного старта). ' +
        'Остановите эфир, подождите секунду и нажмите LIVE снова.'
      )
    }
    if (m) return m
  }
  return 'Не удалось запустить эфир студии. Попробуйте ещё раз.'
}
