# Proxy fallback: `proxy.redflow.online` (RU network)

## Что получим в итоге

Фронтенд **по умолчанию пытается ходить напрямую** на `https://api2.redflow.online`.
Если сеть/провайдер блокирует прямой доступ, то с **коротким таймаутом (~3s)** выполняется probe `GET /api/health` и приложение **автоматически переключается** на `https://proxy.redflow.online`.

- Решение (primary vs proxy) **кэшируется в localStorage на 1 час**.
- Работает и для **HTTP**, и для **WebSocket** (`/ws`), т.к. WS берётся от выбранного base.

---

## Конфиг фронтенда

В `.env`:

```env
VITE_API_BASE=https://api2.redflow.online
VITE_API_FALLBACK=https://proxy.redflow.online
```

Проверка выбора хранится в localStorage ключом `rf_api_base` (TTL 1h).

---

## Nginx на VPS-прокси (пример)

Файл `/etc/nginx/sites-available/redflow-proxy`:

```nginx
server {
    listen 80;
    server_name proxy.redflow.online;
}

server {
    listen 443 ssl http2;
    server_name proxy.redflow.online;

    ssl_certificate     /etc/letsencrypt/live/proxy.redflow.online/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/proxy.redflow.online/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;

    location / {
        proxy_pass            https://api2.redflow.online;
        proxy_ssl_server_name on;
        proxy_set_header      Host            api2.redflow.online;
        proxy_set_header      X-Real-IP       $remote_addr;
        proxy_set_header      X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header      X-Forwarded-Proto $scheme;
        proxy_connect_timeout 10s;
        proxy_read_timeout    60s;
    }

    location /ws {
        proxy_pass            https://api2.redflow.online;
        proxy_ssl_server_name on;
        proxy_set_header      Host       api2.redflow.online;
        proxy_http_version    1.1;
        proxy_set_header      Upgrade    $http_upgrade;
        proxy_set_header      Connection "upgrade";
        proxy_read_timeout    3600s;
        proxy_send_timeout    3600s;
    }
}
```

Важно: сертификаты появятся только после `certbot --nginx -d proxy.redflow.online`.

---

## Ручная проверка

```bash
curl -fsS https://proxy.redflow.online/api/health
```

Ожидается JSON с `ok:true` (или хотя бы HTTP 200).

