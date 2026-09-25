#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  StreamTVDepot – EC2 / VPS Nginx-RTMP Setup Script
#  Tested on: Ubuntu 22.04 LTS
#
#  What this installs:
#    • nginx compiled with nginx-rtmp-module (ABR live streaming)
#    • ffmpeg  (multi-quality transcoding)
#    • Nginx serves HLS segments over HTTP on port 80
#    • Nginx accepts RTMP streams on port 1935
#    • on_publish / on_publish_done callbacks validate stream keys via your
#      StreamTVDepot backend before allowing the stream
#
#  Usage:
#    chmod +x setup-rtmp-server.sh
#    sudo ./setup-rtmp-server.sh
#
#  After running, set in your V2/.env:
#    RTMP_SERVER_HOST=<this-server-ip-or-domain>
#    RTMP_APP_NAME=live
#    RTMP_HLS_BASE_URL=http://<this-server-ip-or-domain>/hls
#
#  OBS / Encoder settings:
#    Server:     rtmp://<this-server-ip>/live
#    Stream Key: <key shown in the admin panel>
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

BACKEND_URL="${BACKEND_URL:-http://YOUR_BACKEND_HOST/api/v1}"
HLS_DIR="/var/hls"
NGINX_VERSION="1.25.3"
RTMP_MODULE_VERSION="1.2.2"
BUILD_DIR="/tmp/nginx-rtmp-build"

echo "─── StreamTVDepot RTMP Server Setup ───────────────────────────────────────"
echo "Backend callback URL : $BACKEND_URL"
echo "HLS output directory : $HLS_DIR"
echo "────────────────────────────────────────────────────────────────────────"

# ─── 1. System packages ───────────────────────────────────────────────────────
apt-get update -y
apt-get install -y \
    build-essential \
    libpcre3 libpcre3-dev \
    zlib1g zlib1g-dev \
    libssl-dev \
    libxslt1-dev \
    libgd-dev \
    ffmpeg \
    git \
    wget \
    curl

# ─── 2. Download Nginx + RTMP module ─────────────────────────────────────────
mkdir -p "$BUILD_DIR" && cd "$BUILD_DIR"

wget -q "http://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz"
tar xzf "nginx-${NGINX_VERSION}.tar.gz"

git clone --depth=1 --branch "v${RTMP_MODULE_VERSION}" \
    https://github.com/arut/nginx-rtmp-module.git 2>/dev/null \
    || git clone --depth=1 https://github.com/arut/nginx-rtmp-module.git

# ─── 3. Compile Nginx with RTMP module ───────────────────────────────────────
cd "nginx-${NGINX_VERSION}"

./configure \
    --prefix=/etc/nginx \
    --sbin-path=/usr/sbin/nginx \
    --modules-path=/etc/nginx/modules \
    --conf-path=/etc/nginx/nginx.conf \
    --error-log-path=/var/log/nginx/error.log \
    --http-log-path=/var/log/nginx/access.log \
    --pid-path=/var/run/nginx.pid \
    --with-http_ssl_module \
    --with-http_v2_module \
    --with-http_stub_status_module \
    --with-http_gzip_static_module \
    --add-module="${BUILD_DIR}/nginx-rtmp-module"

make -j"$(nproc)"
make install

# ─── 4. Create HLS output directory ──────────────────────────────────────────
mkdir -p "$HLS_DIR"
chown -R www-data:www-data "$HLS_DIR" 2>/dev/null || chown -R nginx:nginx "$HLS_DIR" 2>/dev/null || true
chmod 755 "$HLS_DIR"

# ─── 5. Write Nginx config ───────────────────────────────────────────────────
cat > /etc/nginx/nginx.conf << NGINXCONF
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid       /var/run/nginx.pid;

events {
    worker_connections 1024;
}

# ─── RTMP ─────────────────────────────────────────────────────────────────────
rtmp {
    server {
        listen 1935;
        chunk_size 4096;
        timeout 30s;

        # ── Input: OBS / encoder pushes here ──────────────────────────────────
        application live {
            live on;
            record off;

            # Validate stream key via StreamTVDepot backend before allowing stream
            on_publish       ${BACKEND_URL}/rtmp/on-publish;
            on_publish_done  ${BACKEND_URL}/rtmp/on-publish-done;

            # Block direct HLS from the live app – only relay to hls app
            deny play all;

            # Re-encode to multiple bitrates and push to the hls application
            exec ffmpeg -i rtmp://localhost/live/\$name
                -c:v libx264 -preset veryfast -tune zerolatency
                    -b:v 2500k -maxrate 2500k -bufsize 5000k
                    -vf "scale=1280:720,format=yuv420p"
                    -c:a aac -b:a 128k -ar 44100
                    -f flv rtmp://localhost/hls/\$name_720p
                -c:v libx264 -preset veryfast -tune zerolatency
                    -b:v 1000k -maxrate 1000k -bufsize 2000k
                    -vf "scale=854:480,format=yuv420p"
                    -c:a aac -b:a 96k -ar 44100
                    -f flv rtmp://localhost/hls/\$name_480p
                -c:v libx264 -preset veryfast -tune zerolatency
                    -b:v 500k  -maxrate 500k  -bufsize 1000k
                    -vf "scale=640:360,format=yuv420p"
                    -c:a aac -b:a 64k  -ar 44100
                    -f flv rtmp://localhost/hls/\$name_360p
                2>>/var/log/nginx/ffmpeg.log;
        }

        # ── HLS output: receives transcoded streams from ffmpeg ────────────────
        application hls {
            live on;
            record off;

            hls on;
            hls_path ${HLS_DIR};
            hls_fragment 2s;
            hls_playlist_length 10s;
            hls_cleanup on;

            # ABR variant playlist entries
            # These tell nginx-rtmp which stream name suffixes map to which quality
            hls_variant _720p BANDWIDTH=2628000,RESOLUTION=1280x720,CODECS="avc1.4d401f,mp4a.40.2";
            hls_variant _480p BANDWIDTH=1128000,RESOLUTION=854x480,CODECS="avc1.4d401f,mp4a.40.2";
            hls_variant _360p BANDWIDTH=564000,RESOLUTION=640x360,CODECS="avc1.4d401e,mp4a.40.2";

            # Only allow local ffmpeg to publish here
            allow publish 127.0.0.1;
            deny publish all;
        }
    }
}

# ─── HTTP ─────────────────────────────────────────────────────────────────────
http {
    include      mime.types;
    default_type application/octet-stream;
    sendfile     on;
    tcp_nopush   on;
    keepalive_timeout 65;

    server {
        listen 80;
        server_name _;

        # ── HLS segment serving ───────────────────────────────────────────────
        location /hls {
            types {
                application/vnd.apple.mpegurl m3u8;
                video/mp2t                    ts;
            }
            root /var;

            # No cache for live content
            add_header Cache-Control "no-cache, no-store, must-revalidate";
            add_header Pragma        "no-cache";
            add_header Expires       "0";

            # CORS – allow all origins (both localhost and production)
            add_header Access-Control-Allow-Origin  "*";
            add_header Access-Control-Allow-Methods "GET, OPTIONS";
            add_header Access-Control-Allow-Headers "*";

            if (\$request_method = OPTIONS) {
                return 204;
            }
        }

        # ── RTMP stats (optional) ─────────────────────────────────────────────
        location /stat {
            rtmp_stat all;
            rtmp_stat_stylesheet /stat.xsl;
        }
        location /stat.xsl {
            root /etc/nginx/;
        }

        # ── Health check ──────────────────────────────────────────────────────
        location /health {
            return 200 '{"status":"ok"}';
            add_header Content-Type application/json;
        }
    }
}
NGINXCONF

echo "✓ Nginx config written"

# ─── 6. systemd service ───────────────────────────────────────────────────────
cat > /etc/systemd/system/nginx.service << 'SERVICE'
[Unit]
Description=Nginx RTMP Server
After=network.target

[Service]
Type=forking
PIDFile=/var/run/nginx.pid
ExecStartPre=/usr/sbin/nginx -t
ExecStart=/usr/sbin/nginx
ExecReload=/bin/kill -s HUP $MAINPID
ExecStop=/bin/kill -s QUIT $MAINPID
PrivateTmp=true
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable nginx
systemctl restart nginx

echo "✓ Nginx started"

# ─── 7. Firewall ─────────────────────────────────────────────────────────────
if command -v ufw &>/dev/null; then
    ufw allow 1935/tcp comment "RTMP"
    ufw allow 80/tcp   comment "HTTP/HLS"
    ufw reload || true
    echo "✓ UFW rules added (RTMP:1935, HTTP:80)"
fi

# ─── 8. Done ─────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Setup complete!                                             ║"
echo "║                                                              ║"
echo "║  Add to your V2/.env:                                        ║"
echo "║    RTMP_SERVER_HOST=$(curl -s ifconfig.me 2>/dev/null || echo '<this-server-ip>')  ║"
echo "║    RTMP_APP_NAME=live                                        ║"
echo "║    RTMP_HLS_BASE_URL=http://$(curl -s ifconfig.me 2>/dev/null || echo '<server-ip>')/hls ║"
echo "║                                                              ║"
echo "║  OBS settings:                                               ║"
echo "║    Server:     rtmp://$(curl -s ifconfig.me 2>/dev/null || echo '<server-ip>')/live  ║"
echo "║    Stream Key: <key from admin panel>                        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
