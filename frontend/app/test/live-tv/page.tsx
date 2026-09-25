"use client";

/**
 * /test/live-tv
 *
 * Dev-only test page for HLS stream playback.
 * Use this to verify:
 *   – VideoPlayer renders correctly
 *   – HLS ABR stream plays (quality selector appears in control bar)
 *   – DRM key token injection works (paste a token to enable)
 *   – IMA3 ad tag fires a pre-roll (paste a VAST/VMAP tag URL to test)
 *   – Subtitle / caption track loads from a WebVTT URL
 *   – Analytics events log to the Event Log panel
 *
 * Remove or gate behind process.env.NODE_ENV before going to production.
 */

import { useState, useRef, useEffect } from "react";
import VideoPlayer, { type SubtitleTrack, type AdConfig, detectInitialBandwidth } from "@/components/VideoPlayer";
import { getDrmKeyToken } from "@/lib/api/transcoding";

// ─── Bandwidth presets ─────────────────────────────────────────────────────

const BANDWIDTH_PRESETS = [
    { label: "Auto (detect device / network)", bps: 0         },
    { label: "360p  (~0.8 Mbps)",              bps: 800_000   },
    { label: "480p  (~1.5 Mbps)",              bps: 1_500_000 },
    { label: "720p  (~3 Mbps)",                bps: 3_000_000 },
    { label: "1080p (~6 Mbps)",                bps: 6_000_000 },
    { label: "4K    (~10 Mbps)",               bps: 10_000_000},
];

// ─── Built-in test streams ─────────────────────────────────────────────────────

const PRESET_STREAMS = [
    {
        label: "Mux Big Buck Bunny (ABR HLS)",
        url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    },
    {
        label: "Akamai Live Sim (HLS Live)",
        url: "https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8",
    },
    {
        label: "Unified Streaming (DASH/HLS)",
        url: "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8",
    },
    {
        label: "Custom URL",
        url: "",
    },
];

const SAMPLE_VAST =
    "https://pubads.g.doubleclick.net/gampad/ads?iu=/21775744923/external/single_ad_samples&sz=640x480&cust_params=sample_ct%3Dlinear&ciu_szs=300x250%2C728x90&gdfp_req=1&output=vast&unviewed_position_start=1&env=vp&impl=s&correlator=";

// ─── Component ─────────────────────────────────────────────────────────────────

export default function LiveTvTestPage() {
    // Stream source
    const [presetIndex, setPresetIndex] = useState(0);
    const [customUrl, setCustomUrl] = useState("");

    // DRM
    const [drmToken, setDrmToken] = useState("");
    const [fetchingToken, setFetchingToken] = useState(false);

    // Ads
    const [enableAd, setEnableAd] = useState(false);
    const [adTagUrl, setAdTagUrl] = useState(SAMPLE_VAST);

    // Subtitles
    const [subtitleUrl, setSubtitleUrl] = useState("");
    const [subtitleLang, setSubtitleLang] = useState("en");

    // Player state
    const [playerKey, setPlayerKey] = useState(0); // bump to remount player
    const [bwPreset, setBwPreset] = useState(0);   // 0 = auto-detect
    const [detectedBw, setDetectedBw] = useState<number | null>(null);

    useEffect(() => {
        setDetectedBw(detectInitialBandwidth());
    }, []);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [activeQuality, setActiveQuality] = useState<string | null>(null);
    const [playerError, setPlayerError] = useState<string | null>(null);

    // Event log
    const [events, setEvents] = useState<{ time: string; msg: string }[]>([]);
    const logRef = useRef<HTMLDivElement>(null);

    const log = (msg: string) => {
        const time = new Date().toLocaleTimeString();
        setEvents((prev) => {
            const next = [{ time, msg }, ...prev].slice(0, 50);
            return next;
        });
    };

    const resolvedUrl =
        PRESET_STREAMS[presetIndex].url || customUrl;

    // A stream is considered live if it's from the RTMP HLS server
    // (URL contains /hls/ but NOT a UUID — live keys are slug-based, not UUIDs)
    const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    const isLiveStream = resolvedUrl.includes("/hls/") && !UUID_RE.test(resolvedUrl);

    // Extract video UUID from either proxy URL (/hls/{uuid}) or S3 URL (/{uuid}/)
    const videoIdFromUrl: string | undefined = resolvedUrl
        ? (resolvedUrl.match(/\/hls\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i)
           ?? resolvedUrl.match(/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i))
              ?.[1]
        : undefined;

    const tracks: SubtitleTrack[] = subtitleUrl
        ? [{ src: subtitleUrl, srclang: subtitleLang, label: `Subtitles (${subtitleLang})`, default: true }]
        : [];

    const adConfig: AdConfig | undefined = enableAd && adTagUrl
        ? { tagUrl: adTagUrl, timeout: 10, showCountdown: true }
        : undefined;

    const handlePlay = () => { setIsPlaying(true); log("▶  play"); };
    const handlePause = () => { setIsPlaying(false); log("⏸  pause"); };
    const handleEnded = () => { setIsPlaying(false); log("⏹  ended"); };
    const handleError = (msg: string) => { setPlayerError(msg); log(`✖  error: ${msg}`); };
    const handleTimeUpdate = (ct: number, dur: number) => {
        setCurrentTime(ct);
        setDuration(dur);
    };
    const handleQualityChange = (height: number, bitrate: number) => {
        const label = `${height}p  (${Math.round(bitrate / 1000)} kbps)`;
        setActiveQuality(label);
        log(`⚙  quality → ${label}`);
    };
    const handleAdStart  = () => log("📢 ad started");
    const handleAdEnd    = () => log("📢 ad ended");
    const handleAdSkip   = () => log("📢 ad skipped");
    const handleAdError  = () => log("📢 ad error");

    const fmtTime = (s: number) => {
        if (!isFinite(s) || s <= 0) return "--:--";
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${sec.toString().padStart(2, "0")}`;
    };

    return (
        <main className="min-h-screen bg-gray-950 text-gray-100 p-6">
            <div className="max-w-6xl mx-auto space-y-6">

                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Live TV / HLS Stream Test</h1>
                        <p className="text-sm text-gray-400 mt-0.5">
                            Dev-only page — remove or restrict before deploying to production.
                        </p>
                    </div>
                    <span className="rounded-full bg-yellow-500/20 text-yellow-300 text-xs font-semibold px-3 py-1 border border-yellow-500/30">
                        DEV ONLY
                    </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* ── Left column: config ───────────────────────────────── */}
                    <div className="lg:col-span-1 space-y-5">

                        {/* Stream source */}
                        <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
                            <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">
                                Stream Source
                            </h2>
                            <select
                                className="w-full rounded-lg bg-gray-800 border border-gray-700 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={presetIndex}
                                onChange={(e) => setPresetIndex(Number(e.target.value))}
                            >
                                {PRESET_STREAMS.map((s, i) => (
                                    <option key={i} value={i}>{s.label}</option>
                                ))}
                            </select>
                            {PRESET_STREAMS[presetIndex].url === "" && (
                                <input
                                    className="w-full rounded-lg bg-gray-800 border border-gray-700 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="https://your-stream.m3u8"
                                    value={customUrl}
                                    onChange={(e) => setCustomUrl(e.target.value)}
                                />
                            )}
                            <p className="text-xs text-gray-500 break-all">
                                {resolvedUrl || <span className="italic">No URL set</span>}
                            </p>
                        </section>

                        {/* Initial Quality */}
                        <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
                            <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">
                                Initial Quality Hint
                            </h2>
                            <select
                                className="w-full rounded-lg bg-gray-800 border border-gray-700 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={bwPreset}
                                onChange={(e) => setBwPreset(Number(e.target.value))}
                            >
                                {BANDWIDTH_PRESETS.map((p, i) => (
                                    <option key={i} value={i}>{p.label}</option>
                                ))}
                            </select>
                            {bwPreset === 0 && detectedBw !== null && (
                                <div className="rounded-lg bg-blue-950/50 border border-blue-800 px-3 py-2 text-xs">
                                    <span className="text-blue-400 font-semibold">Detected: </span>
                                    <span className="text-blue-200">
                                        {detectedBw >= 1_000_000
                                            ? `${(detectedBw / 1_000_000).toFixed(1)} Mbps`
                                            : `${Math.round(detectedBw / 1_000)} kbps`}
                                    </span>
                                    <span className="text-blue-500 ml-1">
                                        {(navigator as any).connection?.downlink
                                            ? "(Network API)"
                                            : "(screen heuristic)"}
                                    </span>
                                </div>
                            )}
                            <p className="text-xs text-gray-500">
                                Auto uses the Network API or screen size to pick
                                the right starting quality for this device.
                            </p>
                        </section>

                        {/* DRM */}
                        <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
                            <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">
                                AES-128 DRM
                            </h2>
                            <textarea
                                className="w-full rounded-lg bg-gray-800 border border-gray-700 text-xs font-mono px-3 py-2 h-20 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Paste JWT from GET /admin/transcoding/videos/{id}/key-token"
                                value={drmToken}
                                onChange={(e) => setDrmToken(e.target.value)}
                            />
                            <button
                                disabled={fetchingToken}
                                onClick={async () => {
                                    // Extract video UUID from either:
                                    //   proxy URL:  http://localhost:8001/api/v1/hls/{uuid}
                                    //   S3 URL:     https://…/hls/{client_slug}/{uuid}/{filename}.m3u8
                                    const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
                                    const match =
                                        // 1. proxy pattern: /hls/{uuid}
                                        resolvedUrl.match(new RegExp(`/hls/(${UUID_RE.source})\\b`, "i")) ??
                                        // 2. S3 pattern: /{uuid}/ (UUID surrounded by slashes = video id)
                                        resolvedUrl.match(new RegExp(`/(${UUID_RE.source})/`, "i"));
                                    if (!match) {
                                        log("✖  Could not extract video ID from URL");
                                        return;
                                    }
                                    setFetchingToken(true);
                                    try {
                                        const { token } = await getDrmKeyToken(match[1]);
                                        setDrmToken(token);
                                        // Reload the player so it starts with the token already resolved
                                        setPlayerKey((k) => k + 1);
                                        log("🔑 DRM key token fetched — player reloaded");
                                    } catch (e: any) {
                                        log(`✖  key-token error: ${e?.response?.data?.detail ?? e?.message}`);
                                    } finally {
                                        setFetchingToken(false);
                                    }
                                }}
                                className="w-full rounded-lg bg-purple-700 hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold py-1.5 transition-colors"
                            >
                                {fetchingToken ? "Fetching…" : "Fetch Key Token from URL"}
                            </button>
                            <p className="text-xs text-gray-500">
                                Leave blank for clear (unencrypted) streams.
                            </p>
                        </section>

                        {/* Ads */}
                        <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">
                                    IMA3 / VAST Ads
                                </h2>
                                <button
                                    onClick={() => setEnableAd((v) => !v)}
                                    className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${enableAd ? "bg-blue-600" : "bg-gray-700"}`}
                                >
                                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform mt-0.5 ${enableAd ? "translate-x-4" : "translate-x-0.5"}`} />
                                </button>
                            </div>
                            {enableAd && (
                                <textarea
                                    className="w-full rounded-lg bg-gray-800 border border-gray-700 text-xs font-mono px-3 py-2 h-20 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={adTagUrl}
                                    onChange={(e) => setAdTagUrl(e.target.value)}
                                />
                            )}
                        </section>

                        {/* Subtitles */}
                        <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
                            <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">
                                Subtitles (WebVTT)
                            </h2>
                            <input
                                className="w-full rounded-lg bg-gray-800 border border-gray-700 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="https://example.com/subs/en.vtt"
                                value={subtitleUrl}
                                onChange={(e) => setSubtitleUrl(e.target.value)}
                            />
                            <input
                                className="w-full rounded-lg bg-gray-800 border border-gray-700 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Language code (e.g. en)"
                                value={subtitleLang}
                                onChange={(e) => setSubtitleLang(e.target.value)}
                            />
                        </section>

                        {/* Load button */}
                        <button
                            disabled={!resolvedUrl}
                            onClick={() => {
                                setPlayerError(null);
                                setEvents([]);
                                setIsPlaying(false);
                                setActiveQuality(null);
                                setPlayerKey((k) => k + 1); // remount player with new config
                                log("🔄 player reloaded");
                            }}
                            className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed font-semibold py-2.5 text-sm transition-colors"
                        >
                            Load / Reload Player
                        </button>
                    </div>

                    {/* ── Right column: player + stats ─────────────────────── */}
                    <div className="lg:col-span-2 space-y-4">

                        {/* Player */}
                        <div className="rounded-xl overflow-hidden border border-gray-800 bg-black">
                            {resolvedUrl ? (
                                <VideoPlayer
                                    key={playerKey}
                                    src={resolvedUrl}
                                    isLive={isLiveStream}
                                    videoId={videoIdFromUrl}
                                    drmKeyToken={drmToken || undefined}
                                    tracks={tracks}
                                    adConfig={adConfig}
                                    initialBandwidth={BANDWIDTH_PRESETS[bwPreset].bps || undefined}
                                    autoPlay={false}
                                    onPlay={handlePlay}
                                    onPause={handlePause}
                                    onEnded={handleEnded}
                                    onError={handleError}
                                    onTimeUpdate={handleTimeUpdate}
                                    onQualityChange={handleQualityChange}
                                    onAdStart={handleAdStart}
                                    onAdEnd={handleAdEnd}
                                    onAdSkip={handleAdSkip}
                                    onAdError={handleAdError}
                                />
                            ) : (
                                <div className="aspect-video flex items-center justify-center text-gray-600 text-sm">
                                    Select or enter a stream URL and click Load
                                </div>
                            )}
                        </div>

                        {/* Status bar */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {[
                                { label: "Status",   value: playerError ? "Error" : isPlaying ? "Playing" : "Paused" },
                                { label: "Time",     value: `${fmtTime(currentTime)} / ${fmtTime(duration)}` },
                                { label: "Quality",  value: activeQuality ?? "auto" },
                                { label: "DRM",      value: drmToken ? "Enabled" : "Off" },
                            ].map(({ label, value }) => (
                                <div key={label} className="rounded-lg bg-gray-900 border border-gray-800 px-3 py-2">
                                    <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                                    <p className={`text-sm font-semibold truncate ${label === "Status" && playerError ? "text-red-400" : label === "Status" && isPlaying ? "text-green-400" : "text-gray-200"}`}>
                                        {value}
                                    </p>
                                </div>
                            ))}
                        </div>

                        {/* Error detail */}
                        {playerError && (
                            <div className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">
                                <span className="font-semibold">Error: </span>{playerError}
                            </div>
                        )}

                        {/* Event log */}
                        <section className="rounded-xl border border-gray-800 bg-gray-900">
                            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
                                <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">Event Log</h2>
                                <button
                                    onClick={() => setEvents([])}
                                    className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                                >
                                    Clear
                                </button>
                            </div>
                            <div
                                ref={logRef}
                                className="h-48 overflow-y-auto px-4 py-3 space-y-1 font-mono text-xs"
                            >
                                {events.length === 0 ? (
                                    <p className="text-gray-600 italic">No events yet — load a stream to start.</p>
                                ) : (
                                    events.map((e, i) => (
                                        <div key={i} className="flex gap-3">
                                            <span className="text-gray-600 shrink-0">{e.time}</span>
                                            <span className="text-gray-300">{e.msg}</span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </section>

                        {/* Quick reference */}
                        <section className="rounded-xl border border-gray-800 bg-gray-900/50 px-4 py-3 text-xs text-gray-500 space-y-1">
                            <p className="font-semibold text-gray-400 mb-1">Quick checks</p>
                            <p>✓ <strong>ABR</strong> — quality selector button appears in player control bar for HLS streams</p>
                            <p>✓ <strong>Live HLS</strong> — no seek bar, "LIVE" badge shown by Video.js for live streams</p>
                            <p>✓ <strong>DRM</strong> — paste JWT from <code className="bg-gray-800 px-1 rounded">GET /api/v1/admin/transcoding/videos/&#123;id&#125;/key-token</code></p>
                            <p>✓ <strong>Ads</strong> — toggle on, pre-roll fires before content; check Event Log for ad-started/ended</p>
                            <p>✓ <strong>IMA3 SDK</strong> — run <code className="bg-gray-800 px-1 rounded">window.google?.ima?.VERSION</code> in DevTools console</p>
                            <p>✓ <strong>Subtitles</strong> — paste a <code className="bg-gray-800 px-1 rounded">.vtt</code> URL; caption menu appears in player controls</p>
                        </section>
                    </div>
                </div>
            </div>
        </main>
    );
}
