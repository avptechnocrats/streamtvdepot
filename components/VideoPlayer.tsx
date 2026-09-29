"use client";

/**
 * VideoPlayer  –  Video.js 8 + Google IMA3 (full feature set)
 *
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │  ABR / HLS  │  AES-128 DRM  │  IMA3 Ads  │  Subtitles  │  Quality UI    │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * Ads engine: videojs-ima → Google IMA3 SDK
 * ─────────────────────────────────────────
 *  Supports VAST 2/3/4, VPAID 1/2 (Flash-free JS), VMAP (multi-roll scheduling),
 *  ad pods, companion banners, skip button + countdown, AdSense / Ad Manager,
 *  and the full IMA3 tracking pixel suite (quartile, click, etc.).
 *
 *  Requirements:
 *   1. The IMA3 SDK script is loaded in app/layout.tsx via next/script
 *      strategy="afterInteractive".  Do NOT remove it from the layout.
 *   2. Pass adConfig.tagUrl — any VAST/VPAID/VMAP tag URL.
 *   3. The component waits for window.google?.ima to be available before
 *      calling player.ima() so there is no race condition on slow connections.
 *
 * VMAP (pre + mid + post-roll scheduling)
 * ────────────────────────────────────────
 *  Just pass a VMAP tag URL as adConfig.tagUrl.  IMA3 handles the timeline
 *  scheduling automatically — no extra config needed.
 *
 * ABR / HLS  –  VHS (bundled in video.js 8)
 * AES-128 DRM  –  VHS beforeRequest injects Authorization header on key fetches
 * Subtitles  –  addRemoteTextTrack per track; native Video.js caption menu
 * Quality selector  –  videojs-hls-quality-selector button in control bar
 * Analytics  –  onPlay/onPause/onEnded/onTimeUpdate/onQualityChange +
 *               onAdStart/onAdEnd/onAdSkip/onAdError
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { RotateCcw, RotateCw, Play, Pause, Volume2, VolumeX, Maximize, Minimize, X, ChevronLeft, PictureInPicture2, Settings, Check } from "lucide-react";
import videojs from "video.js";
import type Player from "video.js/dist/types/player";
import "video.js/dist/video-js.css";

// ─── Plugin type augmentations ────────────────────────────────────────────────

interface QualityLevel {
    height: number;
    bitrate: number;
    enabled: boolean;
    id: string;
    width: number;
}

interface QualityLevelList {
    readonly length: number;
    selectedIndex: number;
    [index: number]: QualityLevel;
    on(event: string, handler: () => void): void;
    off(event: string, handler: () => void): void;
}

interface ImaOptions {
    adTagUrl: string;
    timeout?: number;
    /** Disable IMA's custom playback on iOS 10+ to avoid double-play issues */
    disableCustomPlaybackForIOS10Plus?: boolean;
    /** Show countdown timer overlay (default: true) */
    showCountdown?: boolean;
    /** Allow the content to autoplay after the ad (default: true) */
    adWillAutoPlay?: boolean;
    /** Prevent the user from skipping the ad before the skip offset (seconds) */
    adWillPlayMuted?: boolean;
}

interface ExtendedPlayer extends Player {
    ima(options: ImaOptions): void;
    qualityLevels(): QualityLevelList;
    hlsQualitySelector(options?: { displayCurrentQuality?: boolean }): void;
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface SubtitleTrack {
    /** WebVTT or SRT URL */
    src: string;
    srclang: string;
    label: string;
    default?: boolean;
    kind?: "subtitles" | "captions" | "descriptions";
}

export interface AdConfig {
    /**
     * VAST 2/3/4 tag URL, VPAID tag URL, or VMAP tag URL.
     * IMA3 handles all three formats transparently.
     * Example (Google Ad Manager):
     *   https://pubads.g.doubleclick.net/gampad/ads?iu=/...&sz=640x480&...
     */
    tagUrl: string;
    /**
     * Seconds to wait for the IMA3 SDK + ad to load before giving up (default: 8).
     * Maps to videojs-ima's `timeout` option.
     */
    timeout?: number;
    /**
     * Show the "Ad: X seconds remaining" countdown timer overlay (default: true).
     */
    showCountdown?: boolean;
}

export type DirectAdEventType = "impression" | "start" | "first_quartile" | "midpoint" | "third_quartile" | "complete" | "skip" | "error";

export interface VideoPlayerProps {
    /** HLS manifest (.m3u8) or plain mp4/webm URL */
    src: string;
    /**
     * Video UUID. When provided the player auto-fetches the short-lived DRM
     * key token before initialising so AES-128 encrypted streams play without
     * any extra steps in the consuming component.
     * Requires the current user to be authenticated (admin or viewer JWT in
     * localStorage). An explicit `drmKeyToken` prop always takes precedence.
     */
    videoId?: string;
    /** Short-lived JWT for AES-128 DRM key delivery. Omit for clear streams. */
    drmKeyToken?: string;
    /** Poster / thumbnail image URL */
    poster?: string;
    autoPlay?: boolean;
    muted?: boolean;
    className?: string;
    style?: CSSProperties;
    /** Places the control bar at the top-right and adds edge seek controls. */
    immersiveControls?: boolean;
    /** Allow seeking within the media timeline. Disable for scheduled live playback. */
    allowSeeking?: boolean;
    /**
     * Seconds to seek to once, right after metadata loads. Used to join a
     * linear-channel program at its already-elapsed "live" offset. Ignored when
     * outside the media duration.
     */
    startAt?: number;
    /** WebVTT / SRT subtitle/caption tracks */
    tracks?: SubtitleTrack[];
    /** IMA3 / VAST / VPAID / VMAP ad configuration. Omit to skip ads entirely. */
    adConfig?: AdConfig;
    /**
     * Initial bandwidth hint (bits per second) used to seed the ABR algorithm
     * before any segment is downloaded.
     *
     * When omitted the player auto-detects an appropriate value using:
     *   1. Network Information API (`navigator.connection.downlink`) when available
     *      (Chrome / Android; not supported in Safari / Firefox).
     *   2. Screen width + devicePixelRatio + user-agent heuristic as a fallback.
     *
     * Pass an explicit value to override detection (e.g. force 1080p on a
     * known fast intranet, or 480p on a low-power device).
     */
    initialBandwidth?: number;
    // ── Analytics callbacks ───────────────────────────────────────────────────
    onPlay?: () => void;
    onPause?: () => void;
    onEnded?: () => void;
    onError?: (message: string) => void;
    onTimeUpdate?: (currentTime: number, duration: number) => void;
    /** Fires when ABR switches the active rendition */
    onQualityChange?: (height: number, bitrate: number) => void;
    /** IMA3 ad lifecycle */
    onAdStart?: () => void;
    onAdEnd?: () => void;
    /** User clicked the Skip button */
    onAdSkip?: () => void;
    onAdError?: () => void;
    /** Title shown in the immersive top bar */
    title?: string;
    /** Fires when the user clicks the back/close button in immersive mode */
    onClose?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Estimate a sensible initial bandwidth (bps) to seed the VHS ABR engine
 * before any segment has been downloaded.
 *
 * Priority:
 *  1. navigator.connection.downlink  – real measured speed (Chrome / Android)
 *  2. Screen + UA heuristic          – device-class guess (Safari / Firefox)
 */
export function detectInitialBandwidth(): number {
    if (typeof window === "undefined") return 4_500_000;

    // ── 1. Network Information API ────────────────────────────────────────
    const conn =
        (navigator as any).connection ??
        (navigator as any).mozConnection ??
        (navigator as any).webkitConnection;

    if (conn?.downlink && conn.downlink > 0) {
        // downlink is in Mbps; use 85 % as a conservative buffer
        const bps = conn.downlink * 1_000_000 * 0.85;
        return Math.max(400_000, Math.min(30_000_000, bps));
    }

    // ── 2. Screen / UA heuristic ──────────────────────────────────────────
    const isMobile =
        /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
        window.innerWidth <= 768;

    if (isMobile) {
        // Phones / small tablets — target 480p
        return 1_500_000;
    }

    // Physical pixel width accounts for Retina / HiDPI displays
    const physicalWidth = (window.screen?.width ?? window.innerWidth) * (window.devicePixelRatio ?? 1);

    if (physicalWidth >= 7680 || window.innerWidth >= 3840) {
        // 8K / very large 4K monitor
        return 20_000_000;
    }
    if (physicalWidth >= 3840 || window.innerWidth >= 2560) {
        // 4K / QHD monitor
        return 10_000_000;
    }
    if (window.innerWidth >= 1920) {
        // Full HD desktop
        return 6_000_000;
    }
    if (window.innerWidth >= 1280) {
        // HD laptop / tablet landscape
        return 4_500_000;
    }
    // Small laptop / large tablet
    return 2_500_000;
}

/** Poll until window.google?.ima is defined or the timeout elapses. */
function waitForIma(timeoutMs = 10_000): Promise<void> {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const check = () => {
            if ((window as any).google?.ima) {
                resolve();
            } else if (Date.now() - start > timeoutMs) {
                reject(new Error("IMA3 SDK did not load within the timeout."));
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VideoPlayer({
    src,
    videoId,
    drmKeyToken,
    poster,
    autoPlay = false,
    muted = false,
    className = "",
    style,
    immersiveControls = false,
    allowSeeking = true,
    startAt,
    tracks = [],
    adConfig,
    initialBandwidth,
    title,
    onClose,
    onPlay,
    onPause,
    onEnded,
    onError,
    onTimeUpdate,
    onQualityChange,
    onAdStart,
    onAdEnd,
    onAdSkip,
    onAdError,
}: VideoPlayerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<ExtendedPlayer | null>(null);
    const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const progressRef = useRef<HTMLDivElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const videoElRef = useRef<HTMLVideoElement | null>(null);
    const qualityMenuRef = useRef<HTMLDivElement>(null);
    const lastPlaybackTimeRef = useRef(0);

    // ── Overlay visibility ────────────────────────────────────────────────────
    const [controlsVisible, setControlsVisible] = useState(true);

    // ── Custom playback state (synced from video.js in immersive mode) ────────
    const [isPlaying, setIsPlaying] = useState(autoPlay);
    const [currentTimeSt, setCurrentTimeSt] = useState(0);
    const [durationSt, setDurationSt] = useState(0);
    const [bufferedPct, setBufferedPct] = useState(0);
    const [volumeLevel, setVolumeLevel] = useState(1);
    const [isMuted, setIsMuted] = useState(muted);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isPip, setIsPip] = useState(false);
    const [pipSupported, setPipSupported] = useState(false);
    const [qualities, setQualities] = useState<{ height: number; label: string; idx: number }[]>([]);
    const [activeQuality, setActiveQuality] = useState(-1); // -1 = Auto
    const [showQualityMenu, setShowQualityMenu] = useState(false);
    // While an IMA ad is playing, hide the custom content controls so the ad's
    // own Skip/countdown UI is unobstructed and clickable.
    const [adActive, setAdActive] = useState(false);

    // ── Auto-hide controls ────────────────────────────────────────────────────
    const revealControls = useCallback(() => {
        if (!immersiveControls) return;
        setControlsVisible(true);
        if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
    }, [immersiveControls]);

    useEffect(() => {
        if (immersiveControls) revealControls();
        return () => { if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current); };
    }, [immersiveControls, revealControls]);

    // When an ad finishes or is skipped, bring the content controls back on screen.
    useEffect(() => {
        if (!adActive) revealControls();
    }, [adActive, revealControls]);

    // ── Control handlers ──────────────────────────────────────────────────────
    const seekBy = useCallback((seconds: number) => {
        if (!allowSeeking) return;
        const p = playerRef.current;
        if (!p) return;
        p.currentTime(Math.max(0, Math.min((p.currentTime() ?? 0) + seconds, p.duration() ?? 0)));
    }, [allowSeeking]);

    const togglePlay = useCallback(() => {
        const p = playerRef.current;
        if (!p) return;
        p.paused() ? p.play() : p.pause();
    }, []);

    const toggleMute = useCallback(() => {
        const p = playerRef.current;
        if (!p) return;
        p.muted(!p.muted());
    }, []);

    const changeVolume = useCallback((v: number) => {
        const p = playerRef.current;
        if (!p) return;
        p.volume(v);
        p.muted(v === 0);
    }, []);

    const toggleFullscreen = useCallback(() => {
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            wrapperRef.current?.requestFullscreen();
        }
    }, []);

    const togglePip = useCallback(async () => {
        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
            } else if (videoElRef.current) {
                await videoElRef.current.requestPictureInPicture();
            }
        } catch { /* PiP not supported or denied */ }
    }, []);

    const selectQuality = useCallback((idx: number) => {
        const levels = playerRef.current?.qualityLevels?.();
        if (!levels) return;
        for (let i = 0; i < levels.length; i++) {
            levels[i].enabled = idx === -1 || i === idx;
        }
        setActiveQuality(idx);
        setShowQualityMenu(false);
    }, []);

    const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!allowSeeking) return;
        if (!progressRef.current || !playerRef.current) return;
        const rect = progressRef.current.getBoundingClientRect();
        const ratio = Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1));
        playerRef.current.currentTime(ratio * (playerRef.current.duration() ?? 0));
    }, [allowSeeking]);

    const fmtTime = (s: number) => {
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = Math.floor(s % 60);
        if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
        return `${m}:${String(sec).padStart(2, "0")}`;
    };

    // ── Keyboard shortcuts (immersive mode only) ──────────────────────────────
    useEffect(() => {
        if (!immersiveControls) return;
        const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener("fullscreenchange", onFsChange);
        return () => document.removeEventListener("fullscreenchange", onFsChange);
    }, [immersiveControls]);

    // PiP support detection + state sync
    useEffect(() => {
        setPipSupported(!!document.pictureInPictureEnabled);
        const onEnter = () => setIsPip(true);
        const onLeave = () => setIsPip(false);
        document.addEventListener("enterpictureinpicture", onEnter);
        document.addEventListener("leavepictureinpicture", onLeave);
        return () => {
            document.removeEventListener("enterpictureinpicture", onEnter);
            document.removeEventListener("leavepictureinpicture", onLeave);
        };
    }, []);

    // Close quality menu when clicking outside
    useEffect(() => {
        if (!showQualityMenu) return;
        const handler = (e: MouseEvent) => {
            if (qualityMenuRef.current && !qualityMenuRef.current.contains(e.target as Node)) {
                setShowQualityMenu(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [showQualityMenu]);

    useEffect(() => {
        if (!immersiveControls) return;
        const onKey = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement).tagName;
            if (tag === "INPUT" || tag === "TEXTAREA") return;
            if (e.key === " " || e.key === "k") { e.preventDefault(); togglePlay(); revealControls(); }
            if (e.key === "ArrowLeft") { e.preventDefault(); seekBy(-10); revealControls(); }
            if (e.key === "ArrowRight") { e.preventDefault(); seekBy(10); revealControls(); }
            if (e.key === "f") { e.preventDefault(); toggleFullscreen(); }
            if (e.key === "m") { e.preventDefault(); toggleMute(); }
            if (e.key === "Escape") { onClose?.(); }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [immersiveControls, togglePlay, seekBy, toggleFullscreen, toggleMute, revealControls, onClose]);

    useEffect(() => {
        if (typeof window === "undefined" || !containerRef.current) return;

        let cancelled = false;
        // The player this specific effect run creates. Tracked so React Strict
        // Mode's mount→unmount→mount cycle disposes exactly its own player and
        // never leaves an orphaned instance whose IMA/DOM teardown then throws.
        let localPlayer: ExtendedPlayer | null = null;

        const init = async () => {
            // Load all plugins on the client only (avoids SSR issues)
            const pluginImports: Promise<unknown>[] = [
                import("videojs-contrib-quality-levels"),
                import("videojs-hls-quality-selector"),
            ];

            // Ads are best-effort: if the IMA SDK is blocked (ad blocker) or slow,
            // we skip ads and still play the content instead of aborting playback.
            let adsReady = false;

            // Only load videojs-ima if ads are requested; it triggers IMA init
            if (adConfig?.tagUrl) {
                // videojs-ima requires the videojs-contrib-ads "ads" plugin to be
                // registered first; without it PlayerWrapper construction throws
                // (player.ads is undefined) and a stray onPlayerReady timer then
                // crashes on the half-built controller. Await it before IMA loads.
                await import("videojs-contrib-ads");
                pluginImports.push(import("videojs-ima"));
                try {
                    // Wait for the IMA3 SDK (loaded in layout.tsx). Cap the wait so a
                    // blocked SDK falls back to ad-free content quickly, not after 10s.
                    await waitForIma(4000);
                    adsReady = true;
                } catch {
                    // net::ERR_BLOCKED_BY_CLIENT (ad blocker) or timeout — play ad-free.
                    adsReady = false;
                }
            }

            await Promise.all(pluginImports);
            if (cancelled || !containerRef.current) return;

            // ── Auto-fetch DRM token when videoId provided and no explicit token ──
            let resolvedDrmToken = drmKeyToken;
            if (videoId && !resolvedDrmToken) {
                try {
                    const { getDrmKeyToken } = await import("@/lib/services/transcoding");
                    const result = await getDrmKeyToken(videoId);
                    resolvedDrmToken = result.token;
                } catch {
                    // not a DRM video or user not authenticated — play without token
                }
            }
            if (cancelled) return;

            // Video.js requires a real DOM <video> element
            const videoEl = document.createElement("video");
            videoEl.className = "video-js vjs-big-play-centered";
            containerRef.current!.appendChild(videoEl);
            videoElRef.current = videoEl;

            const isHls =
                src.endsWith(".m3u8") ||
                src.includes("application/x-mpegURL") ||
                src.includes("application/vnd.apple.mpegurl");

            const player = videojs(videoEl, {
                controls: !immersiveControls,
                // "any" attempts autoplay with sound and, if the browser blocks it
                // (no user gesture on a fresh load), retries muted so channels and
                // other autoplay surfaces still start on their own — OTT standard.
                autoplay: autoPlay ? "any" : false,
                muted,
                poster,
                fluid: true,
                aspectRatio: "16:9",
                responsive: true,
                html5: {
                    vhs: {
                        overrideNative: true,
                        smoothQualityChange: true,
                        // false → VHS picks the rendition that matches the
                        // initial bandwidth estimate instead of always starting
                        // at the lowest quality and ramping up.
                        enableLowInitialPlaylist: false,
                        // Seed the bandwidth estimator.  Without this VHS has
                        // no data and often guesses too low on the first segment.
                        // Falls back to device/network detection when no explicit
                        // value is provided by the caller.
                        bandwidth: initialBandwidth ?? detectInitialBandwidth(),
                        withCredentials: false,
                    },
                    nativeAudioTracks: false,
                    nativeVideoTracks: false,
                    nativeTextTracks: false,
                },
                controlBar: {
                    progressControl: allowSeeking,
                },
            }) as ExtendedPlayer;

            // If this effect was torn down while we were awaiting imports/DRM,
            // dispose immediately rather than leaving an orphaned player behind.
            if (cancelled) {
                try { player.dispose(); } catch { /* ignore */ }
                return;
            }
            localPlayer = player;
            playerRef.current = player;
            if (!allowSeeking) {
                player.on("timeupdate", () => {
                    lastPlaybackTimeRef.current = player.currentTime() ?? lastPlaybackTimeRef.current;
                });
                player.on("seeking", () => {
                    const currentTime = player.currentTime() ?? 0;
                    if (Math.abs(currentTime - lastPlaybackTimeRef.current) > 1) {
                        player.currentTime(lastPlaybackTimeRef.current);
                    }
                });
            }
            const contentSource = { src, type: isHls ? "application/x-mpegURL" : "video/mp4" };

            // ── 0. Sync playback state → custom React controls (immersive) ──
            if (immersiveControls) {
                player.on("play", () => setIsPlaying(true));
                player.on("pause", () => setIsPlaying(false));
                player.on("ended", () => setIsPlaying(false));
                player.on("durationchange", () => setDurationSt(player.duration() ?? 0));
                player.on("timeupdate", () => {
                    const ct = player.currentTime() ?? 0;
                    const dur = player.duration() ?? 0;
                    setCurrentTimeSt(ct);
                    try {
                        const buf = player.buffered();
                        if (buf && buf.length > 0 && dur > 0)
                            setBufferedPct((buf.end(buf.length - 1) / dur) * 100);
                    } catch { /* ignore */ }
                });
                player.on("volumechange", () => {
                    setVolumeLevel(player.volume() ?? 1);
                    setIsMuted(player.muted() ?? false);
                });
                // fullscreenchange is handled via document.fullscreenchange
                // (see separate useEffect above) so the overlay stays visible.
            }

            // ── 1. IMA3 Ads (init before src so the pre-roll fires first) ──
            if (adConfig?.tagUrl && adsReady) {
                player.ima({
                    adTagUrl: adConfig.tagUrl,
                    timeout: (adConfig.timeout ?? 8) * 1000,
                    disableCustomPlaybackForIOS10Plus: true,
                    showCountdown: adConfig.showCountdown ?? true,
                    adWillAutoPlay: autoPlay,
                    adWillPlayMuted: muted,
                });

                // Defense-in-depth: videojs-ima relays player volume/fullscreen into
                // its Controller, which derefs this.adUi/this.sdkImpl. Guard the relays
                // so a stray event during init/teardown can never crash playback.
                const imaController = (player as any).ima?.controller;
                const imaProto = imaController
                    ? Object.getPrototypeOf(imaController)
                    : undefined;
                if (imaProto && !imaProto.__signalviewVolumeGuard) {
                    imaProto.__signalviewVolumeGuard = true;
                    for (const method of ["onPlayerVolumeChanged", "onPlayerEnterFullscreen", "onPlayerExitFullscreen"] as const) {
                        const original = imaProto[method];
                        if (typeof original === "function") {
                            imaProto[method] = function (this: any, ...args: unknown[]) {
                                if (!this.adUi || !this.sdkImpl) return undefined;
                                return original.apply(this, args);
                            };
                        }
                    }
                }

                // Ad lifecycle — videojs-contrib-ads fires adstart/adend/adskip
                // (NOT the ads-* names); binding these reliably toggles the ad UI.
                player.on("adstart", () => { setAdActive(true); onAdStart?.(); });
                player.on("adend", () => { setAdActive(false); onAdEnd?.(); });
                player.on("adskip", () => { setAdActive(false); onAdSkip?.(); });
                player.on("adtimeout", () => setAdActive(false));
                player.on("adserror", () => { setAdActive(false); onAdError?.(); });
                player.on("contentplayback", () => setAdActive(false));
            }

            // ── 2. Main content source ──────────────────────────────────────
            player.src(contentSource);

            // Linear channel: join the current program at its already-elapsed offset
            // so every viewer sees the same point, like real broadcast TV. Applied
            // once after metadata is known and only when the offset is within range.
            if (startAt && startAt > 0) {
                player.one("loadedmetadata", () => {
                    const dur = player.duration() ?? 0;
                    if (dur > 0 && startAt < dur - 1) {
                        try { player.currentTime(startAt); } catch { /* ignore */ }
                    }
                });
            }

            // ── 3. Subtitle / caption tracks ────────────────────────────────
            tracks.forEach((t) => {
                player.addRemoteTextTrack(
                    {
                        kind: t.kind ?? "subtitles",
                        src: t.src,
                        srclang: t.srclang,
                        label: t.label,
                        default: t.default ?? false,
                    },
                    false // manualCleanup=false → disposed with the player
                );
            });

            // ── 4. Quality selector (HLS only) ───────────────────────────────
            if (isHls) {
                player.ready(() => {
                    if (!immersiveControls) {
                        // show native videojs quality selector button when not immersive
                        player.hlsQualitySelector({ displayCurrentQuality: true });
                    }
                });
                // Populate custom quality list for immersive mode
                player.on("loadedmetadata", () => {
                    const levels = player.qualityLevels?.();
                    if (!levels) return;
                    const qs: { height: number; label: string; idx: number }[] = [];
                    for (let i = 0; i < levels.length; i++) {
                        const l = levels[i];
                        if (l.height > 0) qs.push({ height: l.height, label: `${l.height}p`, idx: i });
                    }
                    qs.sort((a, b) => b.height - a.height);
                    const seen = new Set<number>();
                    setQualities(qs.filter(q => { if (seen.has(q.height)) return false; seen.add(q.height); return true; }));
                });
            }

            // ── 5. AES-128 DRM: inject auth header on #EXT-X-KEY requests ────
            //    VHS's beforeRequest hook intercepts all XHR including key fetches.
            //    Filtering on /drm/key/ prevents sending the token to S3/CDN.
            //    We hook on "loadstart" (not "loadedmetadata") because VHS downloads
            //    the AES key BEFORE loadedmetadata fires; loadstart is early enough.
            if (resolvedDrmToken) {
                const _injectDrmHook = () => {
                    if (cancelled) return;
                    const tech = player.tech(true) as any;
                    const vhs = tech?.vhs ?? tech?.hls;
                    if (vhs?.xhr) {
                        vhs.xhr.beforeRequest = (options: any) => {
                            if (
                                typeof options.uri === "string" &&
                                options.uri.includes("/drm/key/")
                            ) {
                                options.headers = {
                                    ...(options.headers ?? {}),
                                    Authorization: `Bearer ${resolvedDrmToken}`,
                                };
                            }
                            return options;
                        };
                    }
                };
                player.on("loadstart", _injectDrmHook);
            }

            // ── 6. Quality-change analytics ──────────────────────────────────
            if (onQualityChange) {
                player.ready(() => {
                    const levels = player.qualityLevels?.();
                    if (levels) {
                        levels.on("change", () => {
                            const active = levels[levels.selectedIndex];
                            if (active) onQualityChange(active.height, active.bitrate);
                        });
                    }
                });
            }

            // ── 7. Standard analytics ────────────────────────────────────────
            if (onPlay) player.on("play", onPlay);
            if (onPause) player.on("pause", onPause);
            if (onEnded) player.on("ended", onEnded);

            if (onTimeUpdate) {
                player.on("timeupdate", () => {
                    onTimeUpdate(player.currentTime() ?? 0, player.duration() ?? 0);
                });
            }

            player.on("error", () => {
                const err = player.error();
                onError?.(err?.message ?? "An unknown playback error occurred.");
            });
        };

        init().catch((err: unknown) => {
            if (!cancelled) {
                onError?.(err instanceof Error ? err.message : "Player failed to initialise.");
            }
        });

        return () => {
            cancelled = true;
            const player = localPlayer;
            localPlayer = null;
            if (playerRef.current === player) playerRef.current = null;
            if (player) {
                // videojs-ima can throw during dispose when a late volumechange
                // reaches its already-torn-down controller (onPlayerVolumeChanged
                // on undefined). Drop volumechange listeners first, then isolate
                // each teardown step so disposal never crashes the app.
                try { player.off("volumechange"); } catch { /* ignore */ }
                try {
                    const ima = (player as any).ima;
                    if (ima && typeof ima.dispose === "function") ima.dispose();
                } catch { /* ignore IMA teardown errors */ }
                try {
                    player.dispose();
                } catch { /* ignore player dispose errors */ }
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [src, videoId, drmKeyToken, adConfig?.tagUrl]);

    const playPct = durationSt > 0 ? (currentTimeSt / durationSt) * 100 : 0;

    return (
        <div
            ref={wrapperRef}
            className={`relative w-full bg-black ${immersiveControls ? "vp-immersive" : ""} ${className}`}
            style={style}
            onPointerMove={revealControls}
            onPointerDown={revealControls}
        >
            {/* Video.js mount target */}
            <div
                ref={containerRef}
                className={`h-full w-full bg-black ${immersiveControls ? "" : "rounded-lg overflow-hidden"}`}
                data-vjs-player
            />

            {/* ── Prime Video-style custom overlay (immersive mode only) ── */}
            {immersiveControls && !adActive && (
                <div
                    className={`vp-overlay${controlsVisible ? " vp-visible" : ""}`}
                    onClick={togglePlay}
                >
                    {/* Gradient vignettes */}
                    <div className="vp-grad-top" />
                    <div className="vp-grad-bottom" />

                    {/* ── Top bar ─────────────────────────────────────────── */}
                    <div className="vp-top-bar" onClick={(e) => e.stopPropagation()}>
                        <button
                            type="button"
                            onClick={onClose}
                            className="vp-back-btn"
                            aria-label="Back"
                        >
                            <ChevronLeft size={22} strokeWidth={2.5} />
                            {title && <span className="vp-title">{title}</span>}
                        </button>

                        <div className="vp-top-right">
                            {/* Volume — compact always-visible horizontal slider */}
                            <div className="vp-volume-area">
                                <button
                                    type="button"
                                    onClick={toggleMute}
                                    className="vp-icon-btn"
                                    aria-label={isMuted ? "Unmute" : "Mute"}
                                >
                                    {isMuted || volumeLevel === 0
                                        ? <VolumeX size={20} />
                                        : <Volume2 size={20} />}
                                </button>
                                <input
                                    type="range"
                                    min={0}
                                    max={1}
                                    step={0.02}
                                    value={isMuted ? 0 : volumeLevel}
                                    onChange={(e) => changeVolume(parseFloat(e.target.value))}
                                    className="vp-volume-slider"
                                    aria-label="Volume"
                                    style={{
                                        background: `linear-gradient(to right, #fff ${Math.round((isMuted ? 0 : volumeLevel) * 100)}%, rgba(255,255,255,0.25) ${Math.round((isMuted ? 0 : volumeLevel) * 100)}%)`
                                    }}
                                />
                            </div>
                            {/* Quality / Settings */}
                            {qualities.length > 0 && (
                                <div className="vp-quality-wrap" ref={qualityMenuRef}>
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setShowQualityMenu(v => !v); }}
                                        className={`vp-icon-btn${showQualityMenu ? " vp-icon-active" : ""}`}
                                        aria-label="Quality settings"
                                    >
                                        <Settings size={20} />
                                    </button>
                                    {showQualityMenu && (
                                        <div className="vp-quality-menu" onClick={(e) => e.stopPropagation()}>
                                            <div className="vp-quality-title">Quality</div>
                                            <button
                                                className={`vp-quality-item${activeQuality === -1 ? " vp-quality-active" : ""}`}
                                                onClick={() => selectQuality(-1)}
                                            >
                                                {activeQuality === -1 && <Check size={13} />}
                                                <span>Auto</span>
                                            </button>
                                            {qualities.map(q => (
                                                <button
                                                    key={q.idx}
                                                    className={`vp-quality-item${activeQuality === q.idx ? " vp-quality-active" : ""}`}
                                                    onClick={() => selectQuality(q.idx)}
                                                >
                                                    {activeQuality === q.idx && <Check size={13} />}
                                                    <span>{q.label}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                            {/* Picture-in-Picture */}
                            {pipSupported && (
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); togglePip(); }}
                                    className={`vp-icon-btn${isPip ? " vp-icon-active" : ""}`}
                                    aria-label={isPip ? "Exit Picture-in-Picture" : "Picture-in-Picture"}
                                >
                                    <PictureInPicture2 size={20} />
                                </button>
                            )}
                            {/* Fullscreen */}
                            <button
                                type="button"
                                onClick={toggleFullscreen}
                                className="vp-icon-btn"
                                aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                            >
                                {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                            </button>
                            {/* Close */}
                            {onClose && (
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="vp-icon-btn vp-close-btn"
                                    aria-label="Close player"
                                >
                                    <X size={20} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* ── Center controls ─────────────────────────────────── */}
                    <div className="vp-center-controls" onClick={(e) => e.stopPropagation()}>
                        {allowSeeking && (
                            <button
                                type="button"
                                onClick={() => { seekBy(-10); revealControls(); }}
                                className="vp-seek-btn"
                                aria-label="Rewind 10 seconds"
                            >
                                <RotateCcw strokeWidth={1.8} />
                                <span>10</span>
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={togglePlay}
                            className="vp-play-btn"
                            aria-label={isPlaying ? "Pause" : "Play"}
                        >
                            {isPlaying
                                ? <Pause size={34} fill="currentColor" strokeWidth={0} />
                                : <Play size={34} fill="currentColor" strokeWidth={0} className="translate-x-0.5" />}
                        </button>

                        {allowSeeking && (
                            <button
                                type="button"
                                onClick={() => { seekBy(10); revealControls(); }}
                                className="vp-seek-btn"
                                aria-label="Forward 10 seconds"
                            >
                                <RotateCw strokeWidth={1.8} />
                                <span>10</span>
                            </button>
                        )}
                    </div>

                    {/* ── Bottom bar ──────────────────────────────────────── */}
                    <div className="vp-bottom-bar" onClick={(e) => e.stopPropagation()}>
                        {/* Seekable progress bar */}
                        {allowSeeking && (
                            <div
                                ref={progressRef}
                                className="vp-progress"
                                onClick={handleProgressClick}
                            >
                                <div className="vp-progress-track" />
                                <div className="vp-progress-buf" style={{ width: `${bufferedPct}%` }} />
                                <div className="vp-progress-fill" style={{ width: `${playPct}%` }} />
                                <div className="vp-progress-thumb" style={{ left: `${playPct}%` }} />
                            </div>
                        )}
                        {/* Time display */}
                        <div className="vp-time-row">
                            <span>{fmtTime(currentTimeSt)}</span>
                            <span className="vp-time-sep">/</span>
                            <span>{fmtTime(durationSt)}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
