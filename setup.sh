#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# vMix Streamer — ручная установка на Ubuntu 22.04 / 24.04
# Запускать от root или через sudo
# Лог: /var/log/vmix-setup.log
# ─────────────────────────────────────────────────────────────────────────────
set -e
LOG=/var/log/vmix-setup.log
exec > >(tee -a "$LOG") 2>&1

echo ""
echo "════════════════════════════════════════"
echo " vMix Streamer Setup — $(date)"
echo "════════════════════════════════════════"

# ── 0. Переменные ─────────────────────────────────────────────────────────────
GITHUB_TOKEN="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"          # ← заменить
REPO_URL="https://${GITHUB_TOKEN}@github.com/VVKrauss/vMix_zoom.git"
APP_DIR="/opt/vmix-streamer"
PUBLIC_IP=$(curl -s --max-time 5 https://api.ipify.org || hostname -I | awk '{print $1}')

echo "→ Public IP: $PUBLIC_IP"
echo "→ App dir:   $APP_DIR"

# ── 1. Системные пакеты ───────────────────────────────────────────────────────
echo ""
echo "[ 1/8 ] Установка системных пакетов..."
apt-get update -qq
apt-get install -y \
  curl wget git nginx ufw ffmpeg \
  build-essential python3 python3-pip \
  ca-certificates gnupg lsb-release htop

# ── 2. Node.js 20 (через NodeSource) ──────────────────────────────────────────
echo ""
echo "[ 2/8 ] Установка Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
node -v
npm -v

# ── 3. PM2 (менеджер процессов) ───────────────────────────────────────────────
echo ""
echo "[ 3/8 ] Установка PM2..."
npm install -g pm2
pm2 startup systemd -u root --hp /root
env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u root --hp /root

# ── 4. Клонировать репозиторий ────────────────────────────────────────────────
echo ""
echo "[ 4/8 ] Клонирование репозитория..."
rm -rf "$APP_DIR"
git clone "$REPO_URL" "$APP_DIR"
echo "→ Клонировано в $APP_DIR"

# ── 5. Создать .env ───────────────────────────────────────────────────────────
echo ""
echo "[ 5/8 ] Создание .env..."
cat > "$APP_DIR/.env" <<ENVEOF
ANNOUNCED_IP=${PUBLIC_IP}
PORT=3000
SRT_BASE_PORT=9001
MAX_PEERS=10
MEDIASOUP_WORKER_COUNT=2
RTC_MIN_PORT=40000
RTC_MAX_PORT=49999
RTP_BASE_PORT=20000
ENVEOF
echo "→ .env создан"
cat "$APP_DIR/.env"

# ── 6. Сборка backend ─────────────────────────────────────────────────────────
echo ""
echo "[ 6/8 ] Сборка backend..."
cd "$APP_DIR/backend"
npm ci
npm run build
echo "→ Backend собран"

# ── 7. Сборка frontend ────────────────────────────────────────────────────────
echo ""
echo "[ 7/8 ] Сборка frontend..."
cd "$APP_DIR/frontend"
npm ci
npm run build
echo "→ Frontend собран в $APP_DIR/frontend/dist"

# ── 8. Nginx ──────────────────────────────────────────────────────────────────
echo ""
echo "[ 8/8 ] Настройка Nginx..."
cp "$APP_DIR/nginx.conf" /etc/nginx/sites-available/vmix-streamer
ln -sf /etc/nginx/sites-available/vmix-streamer /etc/nginx/sites-enabled/vmix-streamer
rm -f /etc/nginx/sites-enabled/default

# Поправить путь к статике в конфиге nginx
sed -i "s|root /usr/share/nginx/html|root $APP_DIR/frontend/dist|" \
  /etc/nginx/sites-available/vmix-streamer

nginx -t
systemctl enable nginx
systemctl restart nginx
echo "→ Nginx запущен"

# ── Запуск backend через PM2 ──────────────────────────────────────────────────
echo ""
echo "[ PM2 ] Запуск backend..."
cd "$APP_DIR"
pm2 delete vmix-backend 2>/dev/null || true
pm2 start backend/dist/index.js \
  --name vmix-backend \
  --env production \
  --log /var/log/vmix-backend.log \
  --time
pm2 save
echo "→ Backend запущен через PM2"

# ── Firewall ──────────────────────────────────────────────────────────────────
echo ""
echo "[ UFW ] Настройка файрвола..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3000/tcp
ufw allow 9001:9010/udp
ufw allow 40000:49999/udp
ufw allow 40000:49999/tcp
ufw --force enable
echo "→ UFW включён"

# ── Готово ────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════"
echo " ✅ Установка завершена!"
echo "════════════════════════════════════════"
echo " Веб-интерфейс : http://${PUBLIC_IP}"
echo " Backend API   : http://${PUBLIC_IP}:3000/health"
echo " SRT для vMix  : srt://${PUBLIC_IP}:9001  (участник 1)"
echo "               : srt://${PUBLIC_IP}:9002  (участник 2)"
echo ""
echo " Логи backend  : pm2 logs vmix-backend"
echo " Статус PM2    : pm2 status"
echo "════════════════════════════════════════"
