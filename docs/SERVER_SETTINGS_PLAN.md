# План: настройки сервера и поток vMix на фронте

## Сверка с бэком (актуально)

### REST `GET` / `PUT` `/api/admin/settings`

Персист на бэке: `services/server/data/admin-settings.json` (в `.gitignore`), путь переопределяется `ADMIN_SETTINGS_PATH`.

**Ответ и тело PUT (camelCase):**

| Поле | Тип | Примечание |
|------|-----|------------|
| `vmixIngress` | объект | Частичный мерж при PUT: не переданные поля не затираются |
| `vmixIngress.latencyMs` | number | |
| `vmixIngress.videoBitrateKbps` | number \| null | null — без целевого битрейта |
| `vmixIngress.maxBitrateKbps` | number \| null | запасной лимит на бэке |
| `vmixIngress.listenPort` | number | |
| `vmixIngress.useFixedListenPort` | boolean | ранее на фронте могло называться fixedListenPort |
| `signalingUrl` | string \| null | только `http` / `https` / `ws` / `wss`, до 2048 символов |
| `updatedAt` | string? | ISO, опционально |

Внутри `vmixIngress` на бэке при разборе тела также допускаются **snake_case** (`latency_ms`, `video_bitrate_kbps`, `max_bitrate_kbps`, `listen_port`, `use_fixed_listen_port`) и **вложенный** объект `vmix_ingress`.

**Ошибки:** **400** + `{ "error": string }`; неверный или отсутствующий Bearer при закрытом доступе → **401** (не 403).

**Auth:**

- Если на сервере задан `API_SECRET`: **PUT** только с `Authorization: Bearer <секрет>`. **GET** с тем же Bearer, кроме `ADMIN_SETTINGS_PUBLIC_READ=1` (тогда GET без токена; PUT по-прежнему с секретом).
- Если `API_SECRET` пустой — **GET** и **PUT** без токена (как остальной админ в dev).

Секреты SRT (**passphrase**, **streamId**, **pbkeylen**) в файл настроек **не** пишутся — остаются в браузере (модалка vMix / локальные поля).

### `startVmixIngress` (Socket.IO)

| Поле | Фронт (`readVmixIngressEmitExtras` после синка) | Бэк |
|------|--------------------------------------------------|-----|
| `latencyMs` | всегда из кэша vmix | libsrt и т.д. |
| `videoBitrateKbps` | только если в кэше **не** null | приоритетнее `maxBitrateKbps` |
| `maxBitrateKbps` | только если `videoBitrateKbps` null, а max в кэше не null | запасной вариант |
| `listenPort` | только при `useFixedListenPort: true` | фиксированный UDP и т.д. |

Ошибки с бэка показываются в тосте как есть (в т.ч. запрет фиксированного порта).

### Ack после успешного старта

| Поле | Фронт |
|------|--------|
| `videoBitrateKbps` | Парсится в `VmixIngressInfo`; в модалке vMix: число кбит/с или «без лимита» при `null` |

### Рестарт

| Маршрут | `POST /api/admin/server-restart` |
|--------|-----------------------------------|
| Заголовок | `Authorization: Bearer <API_SECRET>`, если секрет на сервере задан |
| Сборка фронта | `VITE_ADMIN_API_SECRET` (предпочтительно) или `VITE_SERVER_RESTART_SECRET` |
| Ответ | **202** — успех; **503** — рестарт отключён; **401** — нет/неверный Bearer |

---

## Что делает фронт (обзор)

| Область | Реализация |
|--------|------------|
| Адрес клиента (сборка) | `getSignalingDisplayLines()` |
| URL на сервере | поле `signalingUrl` в модалке, GET/PUT `/api/admin/settings` |
| Пресеты vMix → emit | кэш `vmixIngress` в localStorage + `readVmixIngressEmitExtras()` в `useRoom.startVmixIngress` |
| UI | «Настройки сервера» → `ServerSettingsModal.tsx` |

Файлы: `src/api/serverSettingsApi.ts`, `src/utils/adminApiAuth.ts`, `src/types/serverAdminSettings.ts`, `src/config/serverSettingsStorage.ts`, `src/utils/signalingDisplay.ts`, `src/components/ServerSettingsModal.tsx`, `src/hooks/useRoom.ts`.

---

## История

| Дата | Изменение |
|------|-----------|
| 2026-04-07 | Черновик плана + первый UI |
| 2026-04-07 | Модалка, merge в `startVmixIngress`, рестарт |
| 2026-04-07 | Сверка с бэком: ack `videoBitrateKbps`, Bearer для рестарт, клампы 20–5000 мс и 50–20000 кбит/с |
| 2026-04-06 | GET/PUT `/api/admin/settings`, кэш в localStorage, `VITE_ADMIN_API_SECRET` |
| 2026-04-06 | Контракт бэка: `useFixedListenPort`, nullable битрейты, `signalingUrl`, 401, частичный мерж PUT |
