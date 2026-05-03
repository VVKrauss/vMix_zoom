#!/usr/bin/env bash
set -eu

cat > /etc/nginx/conf.d/zz-redflow-gzip.conf <<'EOF'
gzip_vary on;
gzip_comp_level 6;
gzip_min_length 1024;
gzip_types
  text/plain
  text/css
  application/javascript
  application/json
  application/manifest+json
  image/svg+xml
  text/xml
  application/xml
  application/xml+rss;
EOF

python3 <<'PY'
from pathlib import Path
p = Path("/etc/nginx/sites-available/redflow.online")
text = p.read_text(encoding="utf-8")
old = "  location ^~ /assets/ { try_files $uri =404; }\n"
new = """  location ^~ /assets/ {
    try_files $uri =404;
    expires 30d;
    add_header Cache-Control \"public, max-age=2592000, immutable\";
  }
"""
if old not in text:
    raise SystemExit("pattern not found for /assets/ block")
p.write_text(text.replace(old, new, 1), encoding="utf-8")
PY

nginx -t
systemctl reload nginx
echo nginx OK
