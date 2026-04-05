# Фаза A: что нужно от room-platform (демонстрация экрана)

Фронт уже шлёт и обрабатывает следующее; без поддержки на сигналинге второй video producer и закрытие не будут работать корректно для всех клиентов.

## 1. Событие `produce`

В теле запроса помимо `roomId`, `transportId`, `kind`, `rtpParameters` может приходить **`appData`** (объект), например:

```json
{ "source": "screen" }
```

Для камеры фронт по-прежнему может не слать `appData` или слать `{ "source": "camera" }`.

**Нужно:** сохранять `appData` на объекте producer в mediasoup и при рассылке **`newProducer`** (и в списке при `joinRoom`) отдавать фронту, например:

- либо поле `videoSource: 'camera' | 'screen'` (как сейчас ждёт клиент),
- либо проброс `appData` целиком — фронт читает `appData.source`.

Если `appData` не пробрасывать, клиент использует эвристику: **второй** video producer того же участника считается экраном.

## 2. Событие `closeProducer` от клиента (КРИТИЧНО)

**Фронт теперь шлёт:**

```js
socket.emit('closeProducer', { producerId: '<mediasoup producer id>' })
```

Это происходит когда пользователь останавливает демонстрацию экрана (или трек заканчивается). `producer.close()` в mediasoup-client — **локальная** операция, она НЕ закрывает серверный producer автоматически.

**Бэк должен:**

```js
socket.on('closeProducer', ({ producerId }) => {
  // 1. Найти серверный producer по producerId
  const producer = findProducerById(producerId)  // из Map/объекта комнаты
  if (!producer) return

  // 2. Закрыть серверный producer
  producer.close()
  // → это вызовет producer.observer.on('close')

  // 3. Удалить из внутреннего списка producers комнаты
  //    (чтобы новые гости НЕ получали его в existingProducers)
  room.producers.delete(producerId)

  // 4. Разослать producerClosed всем в комнате
  io.to(roomId).emit('producerClosed', { producerId })

  // 5. Если был виртуальный screenPeerId — разослать peerLeft
  if (producer.appData?.source === 'screen' && producer.appData?.screenPeerId) {
    io.to(roomId).emit('peerLeft', { peerId: producer.appData.screenPeerId })
  }
})
```

**Без этого обработчика:** серверный producer остаётся живым → новые гости получают его в `existingProducers` → видят замороженный последний кадр.

## 3. Событие `producerClosed` (рассылка зрителям)

Когда producer закрывается (через `closeProducer` от клиента, `producer.observer.on('close')`, disconnect), **каждый другой клиент в комнате** должен получить событие с **тем же `producerId`**, что был в `newProducer` / ответе `consume`.

- Рассылать **всем сокетам комнаты** (например `io.to(roomId).emit(...)`), а не только инициатору.
- В payload:

```ts
{ producerId: string }
```

Фронт по `producerId` закрывает consumer, очищает `screenStream` / `videoStream` и снимает плитку демонстрации.

## 4. Одна активная демонстрация на комнату

На фронте уже блокируется старт второго экрана, если в `participants` есть чужой `screenStream` или идёт приём экрана. **Обход возможен** (другой клиент, гонка, старый клиент), поэтому на бэке в обработчике `produce` нужно:

- Если `appData.source === 'screen'` (или эквивалент), проверить: в комнате **нет** другого активного video producer с тем же признаком экрана (любой участник).
- При нарушении — ответ с ошибкой (`res({ error: '...' })` / ack с `error`), **не** создавать второй screen producer.
- Опционально: при успешном старте нового экрана закрыть предыдущий screen producer той же комнаты (жёсткая политика «последний выиграл») — только если так задумано продуктом.

Без этой проверки два человека смогут поднять два screen producer, даже если UI у одного из них кнопку отключит.

## 5. Соло-зритель

Те же правила для `joinRoomAsViewer` / списка producers и для `producerClosed`, чтобы при остановке шаринга картинка не «зависала».

---

Громкость и `setSinkId` — только в браузере. Раскладки «спикер» / «галерея» — только UI на фронте.
