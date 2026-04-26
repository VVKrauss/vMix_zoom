## VPS bootstrap (clean infra)

Цель: поднять предсказуемый стек **Postgres + API + Caddy** через Docker Compose и systemd, с релизами в `/opt/redflow/releases` и атомарным переключением `current`.

### 1) Cloud-init

Используйте `deploy/cloud-init.yaml` при создании VPS. Он:
- ставит Docker
- ставит docker compose plugin
- создаёт `/opt/redflow/{releases,shared}`
- добавляет systemd unit `redflow-stack.service` (working dir `/opt/redflow/current/deploy`)

### 2) Переменные окружения на VPS

Создайте файл `/opt/redflow/shared/stack.env` на основе `deploy/stack.env.example`:

- `POSTGRES_PASSWORD=...`

Создайте файл `/opt/redflow/shared/api.env` на основе `deploy/api.env.example` и заполните секреты:

- `PUBLIC_ORIGIN=...`
- `JWT_ACCESS_SECRET=...`
- `JWT_REFRESH_SECRET=...`
- S3 переменные (если включено)

### 3) Релиз-архив и загрузка

На локальной машине соберите архив релиза (без `node_modules`, `dist`, `.env`, дампов):

```bash
# пример (адаптировать под вашу ОС/сборку)
tar -czf release-clean-YYYYMMDD-HHMMSS.tgz \
  --exclude node_modules --exclude dist --exclude .env --exclude "*.sql" --exclude "*.tgz" \
  .
```

Загрузите архив на VPS в `/opt/redflow/releases/` через `scp`.

### 4) Распаковка и переключение current

На VPS:

```bash
mkdir -p /opt/redflow/releases/<ts>
tar -xzf /opt/redflow/releases/release-clean-<ts>.tgz -C /opt/redflow/releases/<ts>
ln -sfn /opt/redflow/releases/<ts> /opt/redflow/current
```

### 5) Накат схемы БД (шаг 4)

На VPS (или локально, если есть доступ к Postgres):

```bash
export DATABASE_URL="postgresql://redflow:${POSTGRES_PASSWORD}@127.0.0.1:5432/redflow"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f /opt/redflow/current/docs/db-schema.vps.sql
```

### 6) Запуск сервиса

```bash
systemctl daemon-reload
systemctl enable --now redflow-stack.service
systemctl status redflow-stack.service --no-pager
```

### 7) Диагностика

```bash
journalctl -u redflow-stack.service -n 200 --no-pager
cd /opt/redflow/current/deploy
/usr/local/lib/docker/cli-plugins/docker-compose -f docker-compose.vps.yml --env-file /opt/redflow/shared/stack.env ps
curl -fsS https://api2.redflow.online/api/health
```

