# ТЗ: видеосервер / сигналинг комнаты (Socket.IO + mediasoup) — контракты с фронтом

Документ для бэкенда **room-platform** (Socket.IO, комнаты, mediasoup). Клиент: репозиторий фронта, основной код — [`src/hooks/useRoom.ts`](../src/hooks/useRoom.ts), solo-режим — [`src/hooks/useSoloViewer.ts`](../src/hooks/useSoloViewer.ts).

**Транспорт:** Socket.IO v4, те же `transports`, что на клиенте (`polling`, `websocket`). В проде URL задаётся `VITE_SIGNALING_URL` (см. [`src/utils/signalingBase.ts`](../src/utils/signalingBase.ts)).

**Общие правила для сервера**

1. Во всех событиях с `roomId` проверять, что сокет **зарегистрирован в этой комнате** (или в viewer-режиме — см. `joinRoomAsViewer`).
2. Идентификаторы участника в ростере и в модерации — **`socket.id`** того сокета, который вызывал `joinRoom` / `joinRoomAsViewer` (на фронте это же значение попадает в `peerId` участника / `targetPeerId`).
3. Поля **`authUserId`**, **`canManageRoom`** в `joinRoom` приходят с клиента: их можно кэшировать на сессии комнаты для UX, но **критичные операции** (кик, mute чужого, завершение комнаты для всех, mute producer «для всех») нужно авторизовать **на сервере** (связка с Supabase / JWT / внутренним staff-флагом — по вашей модели). Не полагаться только на `canManageRoom === true` без проверки, если клиент скомпрометирован.
4. Где указано **ack** — клиент передаёт колбэк Socket.IO; отсутствие вызова ack ломает клиент (`callback is not a function` для `resumeConsumer`).

---

## 1. `joinRoom` (участник с publish/consume)

### 1.1. Запрос (client → server)

Событие: **`joinRoom`**

Payload (объект):

| Поле | Тип | Обяз. | Описание |
|------|-----|-------|----------|
| `roomId` | string | да | Slug / id комнаты |
| `name` | string | да | Отображаемое имя |
| `avatarUrl` | string \| null | нет | URL аватара |
| `authUserId` | string \| null | нет | UUID Supabase Auth, если пользователь залогинен |
| `canManageRoom` | boolean | нет | **Только если `true`:** клиент утверждает право модерировать эфир (кик, mute гостя, и т.д. по контрактам ниже). На фронте выставляется в `true`, если участник — сессионный хост комнаты, **или** staff с доступом к админке, **или** владелец строки `space_rooms` по этому slug, **или** UUID в `space_rooms.room_admin_user_ids` (см. `RoomSession` + [`getSpaceRoomJoinStatus`](../src/lib/spaceRoom.ts)). |
| `resumeParticipantSessionId` | string \| null | нет | Возобновление сессии после обрыва; см. transient errors ниже |

Ack (один объект):

| Поле | Тип | Описание |
|------|-----|----------|
| `rtpCapabilities` | object | RTP capabilities роутера (mediasoup), обязательны при успехе |
| `existingProducers` | array | Элементы в формате **`ProducerDescriptor`** (§8) |
| `peers` | array | Уже в комнате; элементы — **`PeerRosterRow`** (§7) |
| `chatHistory` | array | Опционально; сообщения чата (§6) |
| `participantSessionId` | string | Опционально; id сессии для resume |
| `roomRuntimeState` | `'active' \| 'grace' \| 'ended'` | Опционально |
| `error` | string | При ошибке вместо успешного join |

**Особые значения `error` (клиент ретраит join):**

- `resume_in_progress`
- `session_not_found`

Клиент делает до **12** попыток с паузой **~1.5 s** между ними.

**Ошибки без ретрая (клиент уходит на экран «комната закрыта»):**

- `room_closed`
- `manager_required`
- `manager_reconnecting`

**Семантика `canManageRoom` на бэке (обязательно согласовать):**

- При обработке **`hostKickPeer`**, **`hostRequestPeerMicMute`**, **`endRoomForAll`** (и при необходимости **`hostSetProducerMuted`**) считать отправителя модератором, если на его сессии join сохранено `canManageRoom === true` **и** проходит ваша серверная проверка (рекомендуется сверка с Supabase: `host_user_id`, `room_admin_user_ids`, staff).

---

## 2. Модерация эфира

### 2.1. Кик участника

**Client → server:** `hostKickPeer`

| Поле | Тип | Описание |
|------|-----|----------|
| `roomId` | string | Комната |
| `targetPeerId` | string | **`socket.id`** цели (как в ростере) |

**Ожидаемое поведение**

1. Отправитель — в `roomId`, имеет право модерации (см. §1.1 `canManageRoom` + серверная проверка).
2. Цель — в той же комнате, `targetPeerId !==` отправитель (опционально разрешить self-noop).
3. У цели: **`socket.emit('kicked')`** **без тела** (достаточно пустого события) **или** **`roomClosed`** с `reason: 'kicked'` (§3).
4. На фронте: [`useRoom.ts`](../src/hooks/useRoom.ts) — `kicked` / `roomClosed` → `leave()`, причина **`kicked`** → редирект на `/room-closed`.

Дополнительно: закрыть mediasoup producers/transports цели, убрать из комнаты.

### 2.2. Принудительное выключение микрофона

**Client → server:** `hostRequestPeerMicMute`

| Поле | Тип |
|------|-----|
| `roomId` | string |
| `targetPeerId` | string | `socket.id` цели |

**Server → target client:** **`forceMicMute`** (без payload).

Клиент: [`forceMicMute` handler](../src/hooks/useRoom.ts) — закрывает локальный audio producer и ставит UI в mute.

Право отправителя — как у **`hostKickPeer`**.

### 2.3. Завершение звонка для всех

**Client → server:** **`endRoomForAll`**

| Поле | Тип |
|------|-----|
| `roomId` | string |

Ack: `{ error?: string }` — при успехе без `error` или явный `{ ok: true }` по вашему стилю; клиент проверяет только отсутствие `error` и таймаут **15 s**.

**Поведение:** разослать всем в комнате **`roomClosed`** (например `{ reason: 'room_closed' }`), корректно завершить mediasoup-комнату. Кто может вызывать — бизнес-логика фронта: сессионный хост, владелец/со-админ комнаты в БД, staff; сервер должен проверить самостоятельно.

---

## 3. Закрытие комнаты / исключение (server → client)

### 3.1. `roomClosed`

Payload (объект), поле **`reason`** (string), клиент понимает:

| `reason` | Поведение клиента (`RoomClosedReason`) |
|----------|----------------------------------------|
| `manager_required` | `manager_required` |
| `manager_reconnecting` | `manager_reconnecting` |
| `kicked` | `kicked` |
| иначе / отсутствует | `room_closed` |

При **`room_closed`** и локальном **`endRoomForAll`** клиент может подавить дублирование (внутренний ref) — учитывайте порядок событий.

### 3.2. `kicked`

Без аргументов. Эквивалентно `roomClosed` + `reason: 'kicked'`.

---

## 4. Mediasoup-транспорт и producers

### 4.1. `createWebRtcTransport`

**Emit:** `{ roomId }`  
**Ack:** объект опций send/recv transport для `device.createSendTransport` / `createRecvTransport` (как у mediasoup-demo), либо `{ error: string }`.

### 4.2. `connectTransport`

**Emit:** `{ roomId, transportId, dtlsParameters }`  
**Ack:** `{}` или `{ error: string }`.

### 4.3. `produce`

**Emit:** `{ roomId, transportId, kind, rtpParameters, appData }`  
`appData` — объект с клиента (часто `{ source: 'screen', ... }` для экрана).

**Ack:** `{ id: string }` (producer id) или `{ error: string }`.  
Для **video screen** клиент ожидает опционально **`screenPeerId`** (или snake **`screen_peer_id`**) — отдельный идентификатор плитки экрана.

### 4.4. `consume`

**Emit:** `{ roomId, producerId, transportId, rtpCapabilities }`  
**Ack:** параметры consumer для `recvTransport.consume` + серверные поля, которые парсит клиент (см. `parseConsumeAckFields` в `useRoom.ts`): в т.ч. признак паузы продюсера, тип simulcast/svc если применимо.

При ошибке: **`{ error: string }`**.

### 4.5. `resumeConsumer`

**Emit:** `{ roomId, consumerId }`  
**Ack:** обязателен — клиент передаёт пустой колбэк `() => {}`.

### 4.6. `closeProducer`

**Emit:** `{ roomId, producerId }`  
Ack не обязателен в коде клиента для всех путей; можно без ack.

### 4.7. `setConsumerPreferredLayers`

**Emit:** `{ roomId, consumerId, spatialLayer: 0 | 2, temporalLayer: 2 }`  
(adaptive simulcast/SVC по качеству uplink)

---

## 5. Ростер

### 5.1. `peerJoined` (server → room)

Объект **`PeerRosterRow`**:

| Поле | Тип | Обяз. |
|------|-----|-------|
| `peerId` | string | да (`socket.id`) |
| `name` | string | да |
| `avatarUrl` | string \| null | нет |
| `authUserId` | string \| null | нет |

Допускаются дубликаты имён **`peer_id`**, **`avatar_url`**, **`auth_user_id`** — клиент их читает.

### 5.2. `peerLeft` (server → room)

Объект с **`peerId`** или **`peer_id`** — id вышедшего участника.

---

## 6. Чат и реакции

### 6.1. `chat:message`

**Client → server:** `{ roomId, text: string }` (длина на клиенте до 2000 символов).

**Server → room:** broadcast объекта с полями минимум: `peerId`, `name`, `text`, `ts` (number). Желательно: `senderUserId` / `sender_user_id` / `authUserId` для отображения и модерации.

### 6.2. `reaction`

**Client → server:** `{ roomId, emoji: string, ttlMs?: number }`  
`emoji` — из белого списка на клиенте ([`REACTION_EMOJI_WHITELIST`](../src/types/roomComms.ts)).

**Server → room:** объект с `peerId`, `emoji`, опционально `ts`, `ttlMs`, `roomId`, `senderUserId` / snake_case.

---

## 7. Качество исходящего видео (uplink)

Отдельное ТЗ: [`BACKEND_TZ_VIDEO_UPLINK_SIGNALING.md`](./BACKEND_TZ_VIDEO_UPLINK_SIGNALING.md) — события **`reportVideoUplink`** и **`videoUplink`**.

---

## 8. Дескриптор продюсера (`ProducerDescriptor`)

Сервер шлёт в **`joinRoom`.existingProducers**, **`newProducer`**, и в ack **`joinRoomAsViewer`.producers** (solo) объекты вида:

| Поле | Тип | Описание |
|------|-----|----------|
| `producerId` | string | id producer в mediasoup |
| `peerId` | string | привязка к участнику / виртуальному peer (экран, студия) |
| `kind` | `'audio' \| 'video'` | |
| `name` | string | имя для UI |
| `avatarUrl` | string \| null | нет |
| `authUserId` | string \| null | нет |
| `videoSource` | enum | `'camera' \| 'screen' \| 'vmix' \| 'studio_program'` — желательно явно |
| `audioSource` | enum | `'mic' \| 'screen' \| 'vmix'` |
| `ownerPeerId` | string | для screen: владелец основной плитки |
| `appData` | object | сырой appData producer |
| `hostMuted` | boolean | если хост глобально «приглушил» program audio и т.п. |

Событие **`newProducer`**: тот же объект; клиент подписывается и вызывает `consume`.

Событие **`producerClosed`**: **`{ producerId }`** или **`{ producer_id }`**.

---

## 9. SRT (внешний вход)

**Server → client:** **`srtStarted`**

Тело — **`SrtSessionInfo`**: `peerId`, `roomId`, `sessionId`, `listenPort`, `connectUrlPublic` ([`src/types/index.ts`](../src/types/index.ts)).

REST `/api/frontend/rooms/:roomId` на клиенте используется для solo/инфо; при необходимости синхронизируйте с сигналингом.

---

## 10. vMix / SRT ingress

| Событие | Направление | Payload (ключевое) | Ack |
|---------|-------------|-------------------|-----|
| `startVmixIngress` | C→S | `roomId` + опции: `latencyMs`, `videoBitrateKbps`, `maxBitrateKbps`, `listenPort`, `passphrase`, `streamId`, `pbkeylen` | см. парсинг в `useRoom.ts`: `publicHost`, `listenPort`, `latencyMs`, `videoBitrateKbps`, `passphrase`, `streamId`, `pbkeylen` или `error` |
| `stopVmixIngress` | C→S | `{ roomId }` | `{ error? }` |
| `hostSetProducerMuted` | C→S | `{ roomId, producerId, muted }` | `{ ok, muted?, error? }` |
| `producerHostMutedChanged` | S→C | `{ producerId, muted }` или snake | broadcast участникам |

Таймауты клиента: **15 s** на start/stop.

---

## 11. Студия (RTMP program)

| Событие | Направление | Payload | Ack |
|---------|-------------|---------|-----|
| `startStudioBroadcast` | C→S | `roomId`, `rtmpUrl`, `rtmpKey`, `outputWidth`, `outputHeight`, `maxBitrate`, `maxFramerate` | `{ error? }`, таймаут 15 s |
| `stopStudioBroadcast` | C→S | `{ roomId }` | то же |
| `studioProgramRoomNotify` | C→S | `{ roomId, open: boolean, reason?: string }` | таймаут 7 s |
| `studioProgramRoomNotify` | S→C | `{ open: false, ownerPeerId?, broadcasterPeerId?, ... }` — закрытие плитки «Эфир» | см. `useRoom.ts` |
| `studioBroadcastHealth` | S→C | объект с `roomId`, `state`/`status`, `detail`, привязкой к `broadcasterPeerId` и т.д. | — |
| `studioBroadcastLog` | S→C | строки лога FFmpeg для UI | — |

---

## 12. Solo viewer (только приём)

**`joinRoomAsViewer`**

| Поле | Тип |
|------|-----|
| `roomId` | string |
| `watchPeerId` | string | `socket.id` того, за кем смотрят |

Ack (`JoinRoomAsViewerAck`): **`rtpCapabilities`**, **`producers`** (массив `ProducerDescriptor`), **`error?`**.

Далее тот же **`createWebRtcTransport`**, **`connectTransport`**, **`consume`**, **`resumeConsumer`**, подписка на **`newProducer`** / **`producerClosed`** в логике [`useSoloViewer.ts`](../src/hooks/useSoloViewer.ts).

---

## 13. Критерии приёмки (минимум для модерации и выхода)

1. **`joinRoom`**: в ack есть `rtpCapabilities`, корректный ростер; при `canManageRoom: true` на сервере сохраняется флаг сессии (с последующей **серверной** валидацией для опасных событий).
2. **`hostKickPeer`**: цель получает **`kicked`** или **`roomClosed`** с `reason: 'kicked'`, медиа очищаются.
3. **`hostRequestPeerMicMute`**: у цели приходит **`forceMicMute`**.
4. **`endRoomForAll`**: всем приходит **`room_closed`**, ack успешен у инициатора.
5. **`resumeConsumer`** всегда получает ack-колбэк.
6. Uplink: см. отдельное ТЗ по **`reportVideoUplink` / `videoUplink`**.

---

*Версия по состоянию фронта: репозиторий vMix replacer; дата черновика: 2026-05-03.*
