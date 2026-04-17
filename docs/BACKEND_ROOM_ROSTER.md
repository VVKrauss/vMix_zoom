# Ростер комнаты и профиль участника (сигналинг)

Цель — поведение как в **Google Meet** и **FaceTime**:

1. **Участник считается в комнате сразу после успешного join** по сокету, даже если он ещё **не отдал ни одного audio/video producer**. Остальные клиенты показывают **плитку с именем** (и аватаром, если есть).
2. **Камера выключена** — у клиента **нет активного видео-трека** (трек остановлен, producer закрыт на сервере). Индикатор камеры в ОС гаснет. В плитке — **заглушка** (аватар или инициалы), имя внизу полосы как при включённой камере.
3. **Микрофон** — на фронте по-прежнему можно кратко включать обратно без повторного диалога разрешений: допустим режим *pause producer* / `track.enabled` (как часто делают в Meet). Полное `stop` аудио — опционально, отдельная доработка.

Ниже — контракт для бэкенда (Socket.IO + mediasoup или аналог).

---

## 1. `joinRoom` — входящий payload (клиент → сервер)

Расширить существующий объект, **обратная совместимость**: старые клиенты шлют только `{ roomId, name }`.

```ts
{
  roomId: string
  name: string
  /** Публичный URL аватара (например из Supabase Storage); опционально */
  avatarUrl?: string | null
  /** UUID пользователя в Supabase Auth; опционально, для будущей логики */
  authUserId?: string | null
}
```

Сервер сохраняет у **сокета** (или у peer): `displayName`, `avatarUrl`, `authUserId` — и использует при рассылке ростера и в дескрипторах producer (см. ниже).

---

## 2. `joinRoom` — ответ ack (сервер → клиент, тот же колбэк)

Добавить поле **`peers`**: снимок **уже присутствующих** участников комнаты **без** только что подключившегося сокета.

```ts
{
  rtpCapabilities: RtpCapabilities
  existingProducers?: ProducerDescriptor[]
  chatHistory?: ChatMessage[]
  peers?: PeerRosterEntry[]
}

type PeerRosterEntry = {
  peerId: string   // тот же id, что в Socket.IO / в producer.peerId
  name: string
  avatarUrl?: string | null
}
```

**Требования:**

- Список **актуален** на момент join (все, кто уже в комнате).
- **Не включать** в `peers` самого подключившегося клиента.
- Порядок — по желанию (например по времени входа).

Клиент **сначала** заполняет карту участников из `peers`, **затем** вешает consumers на `existingProducers` и дополняет стримами.

---

## 3. Событие `peerJoined` (сервер → все остальные в комнате)

После успешного присоединения нового сокета разослать **остальным** участникам комнаты (не отправителю):

```ts
socket.to(roomId).emit('peerJoined', {
  peerId: string
  name: string
  avatarUrl?: string | null
})
```

- Если клиент уже есть в локальной карте (гонка) — клиент делает **merge** по `peerId`, не дублирует.
- При **повторном** join того же сокета (переподключение) — либо не слать `peerJoined` повторно всем, либо договориться о `peerReconnected`; минимально — один раз при первом входе в комнату.

---

## 4. Событие `peerLeft` (уже есть — зафиксировать контракт)

При отключении сокета от комнаты все остальные должны получить идентификатор пира, чтобы **удалить плитку целиком**, даже если у него не было producers.

Рекомендуемый payload (как уже может быть у вас):

```ts
{ peerId: string }
// или совместимый с текущим парсером фронта peerIdFromLeftPayload
```

Клиент удаляет запись из ростера **только** по `peerLeft` (или эквиваленту), а не когда закрыт последний consumer.

---

## 5. Закрытие producer (камера/микрофон)

Уже используется `closeProducer` с `{ roomId, producerId }`. При закрытии **видео**:

- Рассылать остальным **`producerClosed`** (как сейчас).
- **Не** удалять участника из ростера — у него остаётся плитка с заглушкой.

Фронт после этого только сбрасывает `videoStream` у участника, **запись в ростере сохраняет** `name` / `avatarUrl`.

---

## 6. `newProducer` / дескриптор producer

Чтобы поздно подключившийся или обновивший аватар клиент не терял картинку, в каждом дескрипторе producer желательно дублировать отображаемые поля:

```ts
type ProducerDescriptor = {
  producerId: string
  peerId: string
  kind: 'audio' | 'video'
  name: string
  avatarUrl?: string | null   // то же, что в ростере на момент produce
  // ... videoSource, appData, ownerPeerId — как у вас сейчас
}
```

Клиент при `consume` **обновляет** у участника `name` и `avatarUrl`, если они пришли в дескрипторе.

---

## 7. Порядок операций на сервере при join (чеклист)

1. Принять `joinRoom`, валидировать `roomId`, сохранить у сокета `name`, `avatarUrl`, `authUserId`.
2. Добавить сокет в комнату (комната Socket.IO / Map peers).
3. Собрать `peers` — все **другие** участники с `peerId`, `name`, `avatarUrl`.
4. Вызвать ack с `rtpCapabilities`, `existingProducers`, `chatHistory`, **`peers`**.
5. После ack — **`socket.to(roomId).emit('peerJoined', { peerId, name, avatarUrl })`** для нового участника (использовать id нового сокета).

---

## 8. Ошибки и краевые случаи

- **Гость без `avatarUrl`** — поле `null`/отсутствует; фронт показывает **инициалы** из `name`.
- **Длина `name`** — разумный лимит на сервере (например 40 символов), как на фронте.
- **`avatarUrl`** — только HTTPS URL; сервер может не проверять содержимое, но ограничить длину строки.

---

## 9. Сводка событий

| Направление | Событие / метод        | Назначение |
|-------------|------------------------|------------|
| C → S       | `joinRoom`             | Вход + имя + опционально аватар / authUserId |
| S → C       | ack `joinRoom`         | + массив `peers` |
| S → others  | `peerJoined`           | Новая плитка без медиа |
| S → others  | `peerLeft`             | Убрать плитку |
| S → others  | `newProducer`          | Подключить аудио/видео к существующей плитке |
| S → others  | `producerClosed`       | Убрать дорожку, плитка остаётся |
| C → S       | `closeProducer`        | Явное закрытие (камера выкл по смыслу Meet) |

После внедрения бэка фронт уже ожидает `peers`, `peerJoined`, расширенный `joinRoom` и `avatarUrl` в дескрипторах там, где это возможно.

---

## 10. `couchMode` (режим «Диван»)

Клиент → сервер (`socket.emit`):

```ts
{ roomId: string; open: boolean; hostPeerId?: string | null }
```

- При **`open: true`** поле **`hostPeerId`** — это `socket.id` отправителя (организатор «дивана»). Только он может запускать демонстрацию экрана на фронте.
- При **`open: false`** — `hostPeerId: null`.

Сервер рассылает **всем в комнате** (включая отправителя, если нужно единообразие), например:

```ts
io.to(roomId).emit('couchMode', { roomId, open, hostPeerId: open ? socket.id : null })
```

Старые клиенты без `hostPeerId` в payload по-прежнему получают только `open` — фронт допускает обратную совместимость.

### 10.1. Куда вставить код (Socket.IO)

Обычно у вас уже есть `io.on('connection', (socket) => { ... })` и обработчики вроде `chat:message`, `reaction`, `joinRoom`. Добавьте рядом **`socket.on('couchMode', ...)`**.

**Важно:** имя комнаты в Socket.IO должно совпадать с тем, куда вы делаете `socket.join(roomId)` при успешном `joinRoom` (тот же `roomId`, что в payload клиента).

### 10.2. Пример хендлера (минимум)

Не доверяйте `hostPeerId` с клиента при `open: true` — подставляйте **`socket.id`**, иначе любой сможет выдать себя организатором.

```ts
import type { Socket } from 'socket.io'

function parseCouchModePayload(raw: unknown): { roomId: string; open: boolean } | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const roomId = typeof o.roomId === 'string' ? o.roomId.trim() : ''
  if (!roomId) return null
  const openRaw = o.open ?? o.isOpen ?? o.value
  const open = openRaw === true || openRaw === 1 || openRaw === 'true'
  return { roomId, open }
}

/** Вызвать внутри io.on('connection', (socket) => { ... }) */
function registerCouchModeHandler(
  socket: Socket,
  opts?: {
    /** Если задано — отклонять couchMode, если сокет не в этой комнате (защита от чужого roomId). */
    isSocketInRoom?: (socket: Socket, roomId: string) => boolean
  },
) {
  socket.on('couchMode', (raw: unknown) => {
    const p = parseCouchModePayload(raw)
    if (!p) return
    if (opts?.isSocketInRoom && !opts.isSocketInRoom(socket, p.roomId)) return

    const hostPeerId = p.open ? socket.id : null
    socket.to(p.roomId).emit('couchMode', {
      roomId: p.roomId,
      open: p.open,
      hostPeerId,
    })
    // Отправителю событие не шлём: у него уже локальный state после emit на клиенте.
    // Если после reconnect нужен строгий sync — можно заменить на io.to(p.roomId).emit(...)
  })
}
```

Если у вас **один** `Server` в переменной `io`:

```ts
socket.on('couchMode', (raw: unknown) => {
  const p = parseCouchModePayload(raw)
  if (!p) return
  const hostPeerId = p.open ? socket.id : null
  io.to(p.roomId).emit('couchMode', { roomId: p.roomId, open: p.open, hostPeerId })
})
```

`io.to` доставит и отправителю — дубликат состояния на фронте безвреден (`setCouchModeOpen` с тем же значением).

### 10.3. Поздний вход в комнату (опционально)

Если участник подключается **после** того, как диван уже открыт, текущий фронт **не** запрашивает снимок `couchMode` в ack `joinRoom`. Тогда до следующего переключения он не узнает состояние. Расширения на выбор:

- добавить в ack `joinRoom` поля `couchMode?: { open: boolean; hostPeerId: string | null }`, выставляя их из серверного состояния комнаты; или
- хранить на сервере `Map<roomId, { open, hostPeerId }>` и при `joinRoom` слать этому сокету один раз `socket.emit('couchMode', ...)`.
