# Self-hosted stack (VPS): Docker Compose шаблон

Файл — **шаблон** для быстрого поднятия инфраструктуры на VPS: Postgres + Redis + backend API + worker (push/link-preview jobs) + Nginx (TLS, проксирование HTTP/WSS).

> Цель: иметь “складываемый” в репо стартовый compose, чтобы на этапе VPS не собирать всё с нуля.

## Директории на VPS (рекомендуется)

```
/opt/vmix-replacer/
  docker-compose.yml
  .env
  nginx/
    api.conf
  data/
    postgres/
    redis/
```

## Доставка файлов/кода на VPS (предпочтительно)

В этом проекте считаем **`scp` основным и предпочтительным способом** доставки файлов на VPS.

Примеры (Windows PowerShell):

```powershell
# Залить весь backend
scp -r .\backend\* deploy@<VPS_IP>:/opt/vmix-replacer/backend/

# Или точечно (быстрее при мелких правках)
scp .\backend\src\dm\routes.ts deploy@<VPS_IP>:/opt/vmix-replacer/backend/src/dm/routes.ts
```

Почему так: на VPS папка `/opt/vmix-replacer` может быть **не git-репозиторием**, поэтому `git pull` там не работает; `scp` даёт предсказуемую доставку и видимый прогресс.

## `.env` (пример переменных для compose)

Минимум (значения — примеры, не копировать как есть):

```env
DOMAIN=example.com

POSTGRES_DB=vmix
POSTGRES_USER=vmix
POSTGRES_PASSWORD=change_me

REDIS_PASSWORD=change_me

JWT_ACCESS_SECRET=change_me
JWT_REFRESH_SECRET=change_me

VAPID_SUBJECT=mailto:you@example.com
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
PUBLIC_APP_URL=https://app.example.com

# S3 (для медиа)
S3_ENDPOINT=https://<provider-endpoint>
S3_REGION=eu-central-1
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_BUCKET=vmix-media
S3_PUBLIC_BASE_URL=
```

## `docker-compose.yml` (шаблон)

```yaml
services:
  postgres:
    image: postgres:17
    container_name: vmix_postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
    networks:
      - internal
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7
    container_name: vmix_redis
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes", "--requirepass", "${REDIS_PASSWORD}"]
    volumes:
      - ./data/redis:/data
    networks:
      - internal
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 10

  api:
    # На этапе реализации заменить на свой image (GHCR) или build: .
    image: vmix/api:latest
    container_name: vmix_api
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379/0

      JWT_ACCESS_SECRET: ${JWT_ACCESS_SECRET}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}

      PUBLIC_APP_URL: ${PUBLIC_APP_URL}
      VAPID_SUBJECT: ${VAPID_SUBJECT}
      VAPID_PUBLIC_KEY: ${VAPID_PUBLIC_KEY}
      VAPID_PRIVATE_KEY: ${VAPID_PRIVATE_KEY}

      S3_ENDPOINT: ${S3_ENDPOINT}
      S3_REGION: ${S3_REGION}
      S3_ACCESS_KEY: ${S3_ACCESS_KEY}
      S3_SECRET_KEY: ${S3_SECRET_KEY}
      S3_BUCKET: ${S3_BUCKET}
      S3_PUBLIC_BASE_URL: ${S3_PUBLIC_BASE_URL}
    networks:
      - internal
      - edge
    expose:
      - "3000"

  worker:
    image: vmix/worker:latest
    container_name: vmix_worker
    restart: unless-stopped
    depends_on:
      api:
        condition: service_started
      redis:
        condition: service_healthy
      postgres:
        condition: service_healthy
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379/0

      PUBLIC_APP_URL: ${PUBLIC_APP_URL}
      VAPID_SUBJECT: ${VAPID_SUBJECT}
      VAPID_PUBLIC_KEY: ${VAPID_PUBLIC_KEY}
      VAPID_PRIVATE_KEY: ${VAPID_PRIVATE_KEY}

      S3_ENDPOINT: ${S3_ENDPOINT}
      S3_REGION: ${S3_REGION}
      S3_ACCESS_KEY: ${S3_ACCESS_KEY}
      S3_SECRET_KEY: ${S3_SECRET_KEY}
      S3_BUCKET: ${S3_BUCKET}
      S3_PUBLIC_BASE_URL: ${S3_PUBLIC_BASE_URL}
    networks:
      - internal

  nginx:
    image: nginx:1.27
    container_name: vmix_nginx
    restart: unless-stopped
    depends_on:
      api:
        condition: service_started
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/api.conf:/etc/nginx/conf.d/default.conf:ro
      - ./data/letsencrypt:/etc/letsencrypt
      - ./data/letsencrypt-www:/var/www/certbot
    networks:
      - edge

  certbot:
    image: certbot/certbot:latest
    container_name: vmix_certbot
    restart: "no"
    volumes:
      - ./data/letsencrypt:/etc/letsencrypt
      - ./data/letsencrypt-www:/var/www/certbot
    entrypoint: ["certbot"]
    networks:
      - edge

networks:
  internal:
    driver: bridge
    internal: true
  edge:
    driver: bridge
```

Примечания:
- `internal: true` сеть не публикуется наружу, Postgres/Redis не торчат в интернет.
- `api` слушает **только внутри** (`expose`), наружу отдаёт Nginx.
- `worker` не публикуется, читает Redis+Postgres.

## `nginx/api.conf` (HTTP + WSS + Let's Encrypt)

```nginx
server {
  listen 80;
  server_name api.${DOMAIN};

  location /.well-known/acme-challenge/ {
    root /var/www/certbot;
  }

  location / {
    return 301 https://$host$request_uri;
  }
}

server {
  listen 443 ssl http2;
  server_name api.${DOMAIN};

  ssl_certificate     /etc/letsencrypt/live/api.${DOMAIN}/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/api.${DOMAIN}/privkey.pem;

  # Базовый hardening (минимум)
  add_header Strict-Transport-Security "max-age=31536000" always;

  client_max_body_size 25m;

  location / {
    proxy_pass http://vmix_api:3000;
    proxy_http_version 1.1;

    # WebSocket
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## Что дальше (на этапе VPS)

- Сгенерировать сертификат:
  - запустить nginx на 80 с location для certbot
  - выполнить `certbot certonly --webroot ...` (через контейнер `certbot`)
  - перезапустить nginx уже с TLS секцией
- Подключить домен `api.<domain>` на IP VPS.
- Настроить systemd unit для `docker compose up -d` (если нужно автозапуск/health).

