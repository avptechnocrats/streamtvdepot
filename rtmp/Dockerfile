# ─────────────────────────────────────────────────────────────────────────────
#  StreamTVDepot – Nginx RTMP container
#
#  Uses the pre-built alfg/nginx-rtmp (Alpine) image — no compilation needed.
#  Adds FFmpeg for ABR transcoding (3 quality levels via exec ffmpeg).
#
#  Port 1935 – RTMP ingest (OBS / encoder pushes here)
#  Port 80   – HTTP HLS segment serving  (/hls/<key>.m3u8)
# ─────────────────────────────────────────────────────────────────────────────
FROM alfg/nginx-rtmp

# FFmpeg for ABR transcoding + HLS output directory
RUN apk add --no-cache ffmpeg \
    && mkdir -p /var/hls \
    && chmod 755 /var/hls

COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 1935 80

CMD ["nginx", "-g", "daemon off;"]
