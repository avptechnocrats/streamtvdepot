# SignalView – Live Streaming

> Last updated: April 2026

---

## Table of Contents

1. [Feature Overview](#1-feature-overview)
2. [Database Schema](#2-database-schema)
3. [API Endpoints](#3-api-endpoints)
4. [How Multi-Channel Works](#4-how-multi-channel-works)
5. [Architecture](#5-architecture)
6. [Docker Setup (current)](#6-docker-setup-current)
7. [Bare-Metal / EC2 Setup (alternative)](#7-bare-metal--ec2-setup-alternative)
8. [Configuration Reference](#8-configuration-reference)
9. [OBS / Encoder Setup](#9-obs--encoder-setup)
10. [Admin Panel Usage](#10-admin-panel-usage)
11. [RTMP Callback Security](#11-rtmp-callback-security)
12. [Future: High-Scale Streaming](#12-future-high-scale-streaming)

---

## 1. Feature Overview

SignalView supports two types of live channels:

| Source type | How it works |
|---|---|
| `external` | Admin pastes an existing M3U8 HLS URL (from a CDN, encoder cloud, etc.) |
| `rtmp` | The platform generates a unique stream key. Broadcaster pushes RTMP from OBS → SignalView RTMP server → FFmpeg transcodes → HLS segments served to viewers |

For `rtmp` channels the full pipeline is:

```
OBS / Encoder
    │  RTMP push  (port 1935)
    ▼
Nginx-RTMP  ──on_publish──▶  FastAPI  (validates key, sets is_live=true)
    │
    │  exec ffmpeg (ABR transcode)
    ▼
Nginx-RTMP hls app  ──writes HLS segments──▶  /var/hls/<key>_720p.m3u8
                                               /var/hls/<key>_480p.m3u8
                                               /var/hls/<key>_360p.m3u8
                                               /var/hls/<key>.m3u8  (ABR master)
    │
    │  HTTP /hls/
    ▼
Video.js player  (HLS.js ABR, auto quality switching)
```

---

## 2. Database Schema

Table: `content_live_streams`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `source` | VARCHAR(20) | `external` or `rtmp` |
| `stream_url` | TEXT | **Dual-purpose**: admin-entered M3U8 URL for `external`; auto-generated HLS URL (`http://<rtmp-server>/hls/<key>.m3u8`) for `rtmp` |
| `stream_key` | VARCHAR(255) | Legacy field for external DRM keys |
| `rtmp_key` | VARCHAR(255) | **Unique per channel** — the secret OBS stream key. Only populated when `source=rtmp`. |
| `stream_status` | VARCHAR(20) | `idle` · `live` · `error` — updated by Nginx callbacks |
| `is_live` | BOOLEAN | Toggle controlled by admin or callbacks |

### Why `stream_url` is reused (not a separate `hls_stream_url`)

Both source types ultimately need one HLS playback URL. The field `stream_url` already existed for external channels. Rather than duplicating it, the backend auto-populates it when creating an `rtmp` channel:

```
stream_url = f"{RTMP_HLS_BASE_URL}/{rtmp_key}.m3u8"
```

### Migration

File: `alembic/versions/a9b3c2d1e0f4_add_rtmp_fields_to_live_streams.py`

Adds: `rtmp_key` (unique index), `stream_status` (default `idle`)

---

## 3. API Endpoints

All under `/api/v1/admin/content/live-streams/`

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | List all channels for the client |
| `POST` | `/` | Create channel — if `source=rtmp`, auto-generates `rtmp_key` + `stream_url` |
| `GET` | `/{id}` | Get single channel |
| `PUT` | `/{id}` | Update channel |
| `DELETE` | `/{id}` | Delete channel |
| `PATCH` | `/{id}/toggle-live` | Set `is_live` + `stream_status` |
| `POST` | `/{id}/regenerate-key` | Rotate `rtmp_key`, reset `is_live=false`, new `stream_url` |

### RTMP Callbacks (called by Nginx, not the admin)

| Method | Path | Caller |
|---|---|---|
| `POST` | `/api/v1/rtmp/on-publish` | Nginx-RTMP when OBS starts streaming |
| `POST` | `/api/v1/rtmp/on-publish-done` | Nginx-RTMP when OBS stops |

`on-publish` returns `2xx` → Nginx allows the stream. Returns `403` → Nginx rejects it (stream key not found in DB).

---

## 4. How Multi-Channel Works

The RTMP URL is **the same for every channel on a server**. The **stream key** is what differentiates channels.

Example — two sports channels streaming simultaneously:

| | Sports HD | Sports 2 |
|---|---|---|
| RTMP URL | `rtmp://rtmp.example.com/live` | `rtmp://rtmp.example.com/live` |
| Stream Key | `sports-hd-aB3xK9mQ` | `sports2-zR7wL2pN` |
| HLS output | `/hls/sports-hd-aB3xK9mQ.m3u8` | `/hls/sports2-zR7wL2pN.m3u8` |

Nginx-RTMP uses the stream key as the **stream name** — it creates an independent HLS segment directory for each. FFmpeg runs a separate process per stream. Both run simultaneously with no conflict.

**OBS for Camera 1 (Game 1):**
```
Server:     rtmp://rtmp.example.com/live
Stream Key: sports-hd-aB3xK9mQ
```

**OBS for Camera 2 (Game 2):**
```
Server:     rtmp://rtmp.example.com/live
Stream Key: sports2-zR7wL2pN
```

**Capacity rule of thumb** (ABR = 3 qualities per stream):

| Instance | vCPU | Simultaneous streams |
|---|---|---|
| t3.medium | 2 | 1 (dev/test only) |
| c5.xlarge | 4 | 2 |
| c5.2xlarge | 8 | 4–5 |
| c5.4xlarge | 16 | 10+ |

---

## 5. Architecture

### Current Docker architecture

```
Internet
    │
    ▼ :8080
┌─────────────────────────────────────────────────────┐
│  signalview_nginx  (nginx:alpine, reverse proxy)    │
│   /api/    → backend:8000                           │
│   /hls/    → rtmp:80   ← NEW                        │
│   /        → frontend:3000                          │
└─────────────────────────────────────────────────────┘
         │              │              │
         ▼              ▼              ▼
   signalview_    signalview_    signalview_
   backend:8000   frontend:3000  rtmp:80 / :1935
                                 │
                                 ├─ Nginx-RTMP (port 1935)
                                 ├─ FFmpeg (spawned per stream)
                                 └─ HLS HTTP server (port 80)
                                    /var/hls/ ← hls_data volume
```

All containers share the `signalview_net` Docker bridge network so they resolve each other by service name (`backend`, `rtmp`, `frontend`, etc.)

### Why a separate `rtmp` container?

The main `nginx:alpine` image does **not** include the `nginx-rtmp-module` — it must be compiled from source. Modifying `nginx/nginx.conf` alone is not enough; the binary itself needs to change. A dedicated container keeps the main reverse proxy clean and lets the RTMP service scale independently.

---

## 6. Docker Setup (current)

### Files

| File | Purpose |
|---|---|
| `V2/rtmp/Dockerfile` | Compiles Nginx + nginx-rtmp-module + FFmpeg |
| `V2/rtmp/nginx.conf` | RTMP `live` app + HLS `hls` app + HTTP server |
| `V2/docker-compose.yml` | `rtmp` service + `hls_data` volume |
| `V2/nginx/nginx.conf` | Added `upstream rtmp` + `/hls/` proxy location |

### Build & start

```bash
# From V2/
docker compose build rtmp
docker compose up -d rtmp

# First time (also build everything):
docker compose up -d --build
```

The `rtmp` container image takes ~5–8 minutes to build (compiles Nginx from source).

### Ports exposed to host

| Port | Service | Used by |
|---|---|---|
| `8080` | nginx (main) | Browser / API |
| `1935` | rtmp | OBS / encoder RTMP push |

HLS is **not** exposed directly — it flows through the main nginx on port 8080:
```
viewer  →  :8080/hls/<key>.m3u8  →  nginx proxy  →  rtmp:80/hls/<key>.m3u8
```

### Environment variables

In `V2/.env`:
```env
RTMP_SERVER_HOST=<your-server-ip-or-domain>
RTMP_APP_NAME=live
RTMP_HLS_BASE_URL=http://<your-server-ip-or-domain>:8080/hls
```

In `V2/frontend/.env.local`:
```env
NEXT_PUBLIC_RTMP_SERVER_HOST=<your-server-ip-or-domain>
```

> **Note:** `RTMP_HLS_BASE_URL` should use the main nginx port (8080), not the rtmp container port (80), because HLS is proxied through nginx.

---

## 7. Bare-Metal / EC2 Setup (alternative)

Use `V2/scripts/setup-rtmp-server.sh` on a **dedicated Ubuntu 22.04 EC2** when you outgrow Docker or want to isolate transcoding load from the application server.

```bash
chmod +x scripts/setup-rtmp-server.sh
sudo BACKEND_URL=https://signalview.mitiztechnologies.in/api/v1 \
    ./scripts/setup-rtmp-server.sh
```

Then set:
```env
RTMP_SERVER_HOST=<ec2-ip>
RTMP_HLS_BASE_URL=http://<ec2-ip>/hls
NEXT_PUBLIC_RTMP_SERVER_HOST=<ec2-ip>
```

Inbound security group rules needed on the EC2: TCP 1935 (RTMP), TCP 80 (HLS HTTP).

---

## 8. Configuration Reference

### backend `config.py`

```python
RTMP_SERVER_HOST: str = ""   # IP or domain of the RTMP server
RTMP_APP_NAME:    str = "live"
RTMP_HLS_BASE_URL: str = ""  # e.g. http://203.0.113.10:8080/hls
```

### rtmp/nginx.conf key values

| Setting | Value | Notes |
|---|---|---|
| `hls_fragment` | `2s` | Segment length — lower = less latency, more HTTP requests |
| `hls_playlist_length` | `10s` | 5 segments in playlist |
| `hls_cleanup` | `on` | Old segments deleted automatically |
| RTMP chunk size | `4096` | Increase to `8192` for 4K |
| Qualities | 720p / 480p / 360p | Add 1080p by adding another `exec ffmpeg` variant |

---

## 9. OBS / Encoder Setup

**Settings → Stream:**

| Field | Value |
|---|---|
| Service | Custom |
| Server | `rtmp://<RTMP_SERVER_HOST>/live` |
| Stream Key | *(copy from admin panel → channel → RTMP Credentials)* |

**Recommended Output settings (OBS):**

| Setting | Value |
|---|---|
| Encoder | x264 |
| Rate Control | CBR |
| Bitrate | 4000–6000 kbps |
| Keyframe Interval | 2s |
| CPU Usage | veryfast |
| Profile | main |
| Tune | zerolatency |

> The server re-encodes to 3 quality levels regardless of your input bitrate, so the input bitrate mainly affects quality of the highest tier.

---

## 10. Admin Panel Usage

1. Go to **Admin → Content → Live TV**
2. Click **Add Channel**, choose **Source = RTMP**
3. The panel auto-generates a **Stream Key** and **HLS Playback URL**
4. Copy the **RTMP URL** (`rtmp://<server>/live`) and **Stream Key** into OBS
5. Click **Go Live** in the admin panel (optional — the Nginx callback also sets it automatically when OBS starts)
6. To rotate a compromised key: click the **regenerate** (↺) icon next to the stream key

---

## 11. RTMP Callback Security

Nginx-RTMP calls `on_publish` before accepting any stream. The backend:

1. Reads `name` from the form data (this is the stream key OBS used)
2. Looks up `LiveStream` where `rtmp_key = name`
3. If found → returns `200`, sets `is_live=True`, `stream_status="live"`
4. If not found → returns `403`, **Nginx drops the connection immediately**

This means an attacker cannot stream to your server without a valid key in your database. Keys are `{slug}-{16-byte-url-safe-token}` (128 bits of entropy).

---

## 12. Future: High-Scale Streaming

When you outgrow a single Docker service or EC2, here is the migration path in order of complexity:

### Tier 1 — Single server optimization (0–5 concurrent streams)

- Keep current Docker setup
- Use a `c5.2xlarge` or `c5.4xlarge` EC2 for more CPU headroom
- Tune FFmpeg preset from `veryfast` to `superfast` (15–20% less CPU, minor quality drop)
- Add 1080p quality only for flagship channels that need it

### Tier 2 — Separate RTMP server (5–15 concurrent streams)

- Run the RTMP + FFmpeg workload on a **dedicated EC2** using `setup-rtmp-server.sh`
- The application stack (FastAPI + Next.js + Postgres) stays on a separate, smaller instance
- Benefit: transcoding CPU spikes don't affect API latency

### Tier 3 — AWS MediaLive (15–50+ concurrent streams, managed)

Replace the self-hosted Nginx-RTMP pipeline with **AWS MediaLive**:

```
OBS → MediaLive input (RTMP push endpoint, per channel)
       ↓
   MediaLive channel (ABR encode: 1080p/720p/480p/360p)
       ↓
   MediaPackage (HLS origin, DVR, time-shift)
       ↓
   CloudFront (CDN, global edge delivery)
       ↓
   Viewer
```

Changes needed in SignalView:
- `rtmp_key` becomes the MediaLive input password
- `stream_url` becomes the MediaPackage CloudFront HLS URL
- `on_publish` / `on_publish_done` replaced by MediaLive CloudWatch events → SNS → Lambda → FastAPI webhook
- Cost: ~$0.50–$1.50/hr per live channel (SD/HD). No FFmpeg management.

### Tier 4 — Dedicated streaming CDN (50+ concurrent streams, global)

Options:
- **AWS IVS (Interactive Video Service)** — fully managed, lowest latency (2–5s), built-in chat API. Best for sports/interactive.
- **Mux** — managed video infrastructure. Simple REST API. Per-minute billing.
- **Wowza Streaming Cloud** — enterprise, RTMP in, HLS out, global CDN.

For any of these, the SignalView backend only needs to:
1. Create a channel via the provider API on channel creation
2. Store the resulting stream key + HLS URL
3. Webhook receives start/stop events instead of Nginx callbacks

### Architecture comparison

| Approach | Concurrent streams | Cost/stream | Complexity | Latency |
|---|---|---|---|---|
| Docker (current) | 2–4 | ~$0.03/hr (EC2) | Low | 6–15s |
| Dedicated EC2 | 10–20 | ~$0.05/hr | Low | 6–15s |
| AWS MediaLive | Unlimited | ~$0.80/hr | Medium | 6–15s |
| AWS IVS | Unlimited | ~$0.20/hr | Low (API) | 2–5s |
| Mux | Unlimited | ~$0.015/min | Low (API) | 3–10s |

### Horizontal scaling notes

- **RTMP ingest cannot be load-balanced** at L4 without stateful routing — a stream must land on the server that has the matching HLS writer open. Use DNS-based routing (one domain per RTMP server) or a dedicated RTMP load balancer (e.g., Wowza, Flussonic) at tier 3+.
- **HLS playback** is stateless — CloudFront or any CDN can cache segments globally once they're on S3 or a stable origin.
- For the current scale, the single Docker `rtmp` service is entirely sufficient.
