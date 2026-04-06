# План: vMix ingress + что уже сделано (следующая итерация)

Документ для работы **«завтра»** и далее: интеграция **SRT Caller → сервер (Listener) → mediasoup** как виртуальный участник **vMix**, плюс сводка по уже реализованному UI/комнате.

**Связанный общий план:** `docs/NEXT_PHASES_PLAN.md` (фазы главная / авторизация / презентации и волна чат·раскладки·сеть).

### Старт завтра (5 шагов)

1. **Типы и привязка плитки:** расширить `ProducerDescriptor` под `vmix`; в `producerVideoRole.ts` (и при необходимости в `consumeProducer`) — для `source === 'vmix'` якорь **`producer.peerId`**, видео в **`videoStream`**, не screen share.
2. **Сокеты в `useRoom`:** `startVmixIngress` / `stopVmixIngress` с ack; показ текстов при `res.error`; после `res.ok` — открыть модалку (без лишних emit после «Ок»).
3. **Модалка vMix Caller:** таблица полей ответа → Hostname, Port, Latency, опционально passphrase / streamId / pbkeylen; тип Caller, H.264 + AAC.
4. **UI:** кнопка **+ vMix** → п.2; при желании **«Убрать vMix»** → `stopVmixIngress`; подпись плитки по `source === 'vmix'` (fallback `name === 'vMix'`); одна карточка на виртуальный peer, два трека.
5. **Проверка:** поздний вход (`existingProducers`), обрыв (`producerClosed` ×2 + `peerLeft`), повторный старт при ошибке «уже есть vMix».

Ниже — полный контракт и детали; при расхождении с бэком сверять ack и поля дескриптора.

---

## Что уже есть на фронте (краткий аудит)

| Область | Состояние |
|--------|-----------|
| Кнопки **+ NDI** / **+ vMix** в панели | Заглушки: слева в `controls-bar__sources`, без `socket.emit` |
| **Режим стримера** (тумблер в шапке) | `useLocalStorageBool('vmix_streamer_mode')`, неон шапки/панели/кнопок — только визуал |
| **SRT для гостей** (экран) | `srtStarted`, копирование URL/порта, соло-URL — для **демонстрации экрана**, не для vMix ingress |
| **joinRoom → existingProducers** | Цикл `consumeProducer(p)` в `useRoom.ts` — готово для продюсеров vMix **если** дескрипторы совместимы с типом |
| **newProducer / producerClosed / peerLeft** | Уже обрабатываются; для vMix нужна корректная **привязка плитки** (см. ниже) |
| **Типы** `ProducerDescriptor` | Сейчас `videoSource?: 'camera' \| 'screen'` — нужно расширить под **`vmix`** (или опираться на `appData.source`) |
| **producerVideoRole.ts** | `resolveConsumeVideoRole` / `videoAnchorPeerId` завязаны на **ownerPeerId** для экрана — для **vMix плитка должна быть на виртуальном `peerId`**, не на инициаторе |

---

## Цель фичи

По нажатию **«Добавить vMix»** участник запускает на сервере **SRT Listener**; в vMix задаётся **Caller** с полями из ответа. После подключения vMix в комнате появляется **один виртуальный участник** с видео + аудио; остальные видят его как обычного удалённого peer’а (с особой подписью плитки).

---

## 1. Socket: `startVmixIngress` (с ack)

**Emit (как у остальных действий в комнате):**

```ts
socket.emit(
  'startVmixIngress',
  {
    roomId,
    latencyMs: 200,        // опционально; иначе сервер — VMIX_DEFAULT_LATENCY_US
    passphrase: '...',     // опционально
    streamId: '...',       // опционально
    pbkeylen: 32,          // только 16 или 32, если есть passphrase
  },
  (res) => { ... },
)
```

**Фронт:**

- Вызов из обработчика кнопки **+ vMix** (и при необходимости отдельный поток для **+ NDI** позже — не смешивать с этим emit, если бэк разведёт).
- При **`res.error`** — показать пользователю текст (маппинг с бэка), например:
  - «уже есть vMix»
  - «ingress выключен»
  - «не участник»
  - и любые другие коды/строки из контракта
- При **`res.ok`** — открыть **модалку** с инструкцией для vMix.

**Файлы (ориентир):** `useRoom.ts` (метод/колбэк, доступ к `socket`), `ControlsBar.tsx` или `RoomPage.tsx` (проброс `onStartVmixIngress`), новый компонент **`VmixIngressModal.tsx`** (или общий `StreamIngressInstructionModal`).

---

## 2. Модалка после `res.ok`: поля → vMix

| Поле ответа | Куда в vMix |
|-------------|-------------|
| `publicHost` | Hostname |
| `listenPort` | Port |
| `latencyMs` | Latency (milliseconds) |
| `passphrase` | Passphrase (если задавали) |
| `streamId` | Stream ID (если задавали) |
| `pbkeylen` | Key length 16/32 (если был passphrase) |

- Тип в vMix: **Caller**; кодеки на стороне vMix — **H.264 + AAC** (как в их скрине); сервер пережимает в **baseline + Opus** для WebRTC — в модалке можно кратко подсказать «настройки качества как обычно для эфира».
- Кнопка **«Ок»** — только закрытие UI; **дополнительный socket после Ок не обязателен**; поток появится, когда vMix подключится к Listener.

---

## 3. События после успешного старта (как у обычных участников)

Сервер шлёт **всем в комнате** (включая инициатора):

1. **`peerJoined`** — `{ peerId, name: 'vMix' }` (виртуальный `peerId`).
2. **`newProducer`** — **дважды** (video + audio). В дескрипторе важно:
   - **`peerId`** — общий виртуальный id vMix (один на оба трека);
   - **`ownerPeerId`** — socket id того, кто нажал «Добавить»;
   - **`source: 'vmix'`** (или `appData.source`) — для подписи плитки («Программа» / vMix);
   - `kind`, `producerId`, `name`.

**Фронт:** тот же путь, что сейчас: `createWebRtcTransport` уже есть → **`consume`** по `producerId` → **`resumeConsumer`**. Отдельный транспорт под vMix **не нужен**.

**Критично — привязка к плитке:**

- Сейчас `videoAnchorPeerId(producer)` отдаёт **`ownerPeerId ?? peerId`**. Для **экрана** это кладёт видео на плитку **владельца**. Для **vMix** по продукту нужна **одна плитка на виртуальный `peerId`**, иначе программа прилипнет к инициатору.
- **Сделать:** если `descriptorVideoSource` / `appData.source === 'vmix'` (или расширенный `videoSource: 'vmix'`), то **anchor для audio и video = `producer.peerId`**, игнорируя `ownerPeerId` для целей карты `participants`.
- **`resolveConsumeVideoRole`:** для vmix трактовать как **«камера/программа»** → в **`videoStream`**, **не** в `screenStream` (не смешивать с демонстрацией экрана и отдельным `screenPeerId`).

**Файлы:** `src/utils/producerVideoRole.ts`, `src/types/index.ts`, `src/hooks/useRoom.ts` (`consumeProducer` при необходимости только если логика не уезжает полностью в хелперы).

**Остановка / обрыв:**

- `producerClosed` на оба `producerId`;
- затем **`peerLeft`** с тем же `peerId`, что в `peerJoined` для vMix.

**Явная остановка:**

```ts
socket.emit('stopVmixIngress', { roomId }, (res) => { ... })
```

- Участник; если сессии нет — **`res.error`**.
- UI: кнопка **«Убрать vMix» / «Остановить»** (политика «только модератор» — на фронте опционально; на бэке сейчас может останавливать любой participant — зафиксировать в доке).

---

## 4. Поздний вход: `joinRoom` ack → `existingProducers`

В ack уже есть **`existingProducers`** — там же могут быть продюсеры vMix с теми же полями (`source: 'vmix'`, и т.д.).

- Обход массива и **`consumeProducer`** для каждого — **без отдельной ветки «только vMix»**, только корректные **`videoAnchorPeerId` / роль video** (см. п.3).
- UI: подпись плитки по **`source === 'vmix'`** или запасной **`name === 'vMix'`**.

---

## 5. UI-логика комнаты

| Задача | Детали |
|--------|--------|
| Одна плитка на `peerId` vMix | Два трека на одну **`ParticipantCard`** (как у обычного гостя) |
| Подпись | «Программа», «vMix» или имя из `peerJoined.name` |
| Не смешивать с screen share | Экран — свой виртуальный peer / `source: 'screen'`; vMix — **`source: 'vmix'`** |
| Кнопка стоп | Вызов `stopVmixIngress` + опционально скрывать/дизейблить **«Добавить vMix»**, пока активна сессия (если бэк отдаёт состояние или по локальному флагу после успешного старта) |

**Файлы:** `RoomPage.tsx` (`orderedTileIds` / список плиток — виртуальный peer уже попадёт в `participants` при корректном `setParticipants`), `ParticipantCard.tsx` (при желании бейдж «Программа»), `ControlsBar.tsx` (wire кнопки).

---

## 6. Бэкенд (чеклист для синхронизации)

Убедиться, что реализовано/согласовано:

- [ ] `startVmixIngress` / `stopVmixIngress` с ack и кодами ошибок
- [ ] SRT Listener, `publicHost`, `listenPort`, согласование **latency**
- [ ] После готовности ingress: рассылка **`peerJoined`** + два **`newProducer`** с полями выше
- [ ] `existingProducers` в `joinRoom` включает активные продюсеры vMix
- [ ] Закрытие: **`producerClosed`** ×2, затем **`peerLeft`**
- [ ] Документация ошибок для фронта (строки/коды)

---

## 7. Порядок работ на фронте (рекомендуемый)

1. **Типы:** расширить `ProducerDescriptor` + `descriptorVideoSource` / `videoAnchorPeerId` для **`vmix`**.
2. **`producerVideoRole.ts` + `consumeProducer`:** одна плитка на виртуальный peer, видео в **`videoStream`**.
3. **`useRoom`:** функции `startVmixIngress` / `stopVmixIngress` (обёртки над `socket.emit` с ack), опционально состояние `vmixIngressActive` из ack/событий.
4. **Модалка** инструкции vMix (копирование полей).
5. **ControlsBar:** кнопка **+ vMix** → вызов из `RoomPage`/`useRoom`.
6. **Тесты вручную:** поздний join, обрыв, повторный старт при ошибке «уже есть vMix».

---

## 8. NDI кнопка

Кнопка **+ NDI** пока **без бэка** в этом плане — либо отдельный контракт позже, либо скрыть до готовности. Не смешивать с `startVmixIngress`, если протокол другой.

---

## История

| Дата | Изменение |
|------|-----------|
| 2026-04-06 | Черновик: vMix ingress по контракту пользователя + аудит фронта + порядок работ |
| 2026-04-06 | В начало добавлен чеклист «Старт завтра (5 шагов)» |
