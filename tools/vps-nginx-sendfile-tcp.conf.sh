#!/usr/bin/env bash
# VPS: в /etc/nginx/nginx.conf внутри http {} — не дублировать sendfile в conf.d.
set -eu
CONF=/etc/nginx/nginx.conf
sed -i 's/sendfile on;/sendfile off;/' "$CONF"
sed -i 's/tcp_nopush on;/tcp_nopush off;/' "$CONF"
if ! grep -qE '^[[:space:]]*tcp_nodelay[[:space:]]+on;' "$CONF"; then
  sed -i '/^[[:space:]]*tcp_nopush off;/a\\ttcp_nodelay on;' "$CONF"
fi
nginx -t
systemctl reload nginx
echo OK
