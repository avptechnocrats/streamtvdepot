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

import { useEffect, useRef, type CSSProperties } from "react";
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
     * Ad insertion mode.
     * - csai: use IMA VMAP/VAST on client (default)
     * - ssai: stream already has ads stitched server-side; skip IMA
     * - none: explicit no-ads mode
     */
    mode?: "csai" | "ssai" | "none";
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
    /** WebVTT / SRT subtitle/caption tracks */
    tracks?: SubtitleTrack[];
    /**
     * Set to true for live RTMP/HLS streams.
     * Enables Video.js liveui (live seek bar), configures VHS live-edge
     * buffering, and suppresses the "ended" event on stream stop.
     */
    isLive?: boolean;
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
    /**
     * Duration (seconds) to skip forward/backward on button click or keyboard shortcut
     * (default: 10 seconds). Use arrow keys (← →) or the control bar buttons to skip.
     */
    skipSeconds?: number;
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
    isLive = false,
    className = "",
    style,
    tracks = [],
    adConfig,
    initialBandwidth,
    skipSeconds = 10,
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
    const keyboardHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(null);

    useEffect(() => {
        if (typeof window === "undefined" || !containerRef.current) return;

        let cancelled = false;

        const init = async () => {
            const clientAdTagUrl =
                adConfig?.mode !== "ssai" && adConfig?.mode !== "none"
                    ? adConfig?.tagUrl
                    : undefined;
            const useClientSideAds =
                !!clientAdTagUrl;

            // Load all plugins on the client only (avoids SSR issues)
            const pluginImports: Promise<unknown>[] = [
                import("videojs-contrib-quality-levels"),
                import("videojs-hls-quality-selector"),
            ];

            // Only load videojs-ima if ads are requested; it triggers IMA init
            if (useClientSideAds) {
                pluginImports.push(import("videojs-ima"));
                // Wait for the IMA3 SDK script (added to layout.tsx) to be ready
                await waitForIma((adConfig.timeout ?? 8) * 1000 + 2000);
            }

            await Promise.all(pluginImports);
            if (cancelled || !containerRef.current) return;

            // ── Auto-fetch DRM token when videoId provided and no explicit token ──
            let resolvedDrmToken = drmKeyToken;
            if (videoId && !resolvedDrmToken) {
                try {
                    const { getPublicDrmKeyToken } = await import("@/lib/api/transcoding");
                    const result = await getPublicDrmKeyToken(videoId);
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

            const isHls =
                src.endsWith(".m3u8") ||
                src.includes("application/x-mpegURL") ||
                src.includes("application/vnd.apple.mpegurl");

            const player = videojs(videoEl, {
                controls: true,
                autoplay: autoPlay,
                muted,
                poster,
                fluid: true,
                aspectRatio: "16:9",
                responsive: true,
                // liveui replaces the progress bar with a live seek bar and
                // prevents Video.js from treating the stream as finished when
                // duration === Infinity.
                liveui: isLive,
                html5: {
                    vhs: {
                        overrideNative: true,
                        smoothQualityChange: true,
                        enableLowInitialPlaylist: isLive ? true : false,
                        bandwidth: initialBandwidth ?? detectInitialBandwidth(),
                        withCredentials: false,
                        // Live-specific: allow VHS to keep refreshing the
                        // playlist and tolerate short gaps (e.g. OBS reconnect).
                        // maxPlaylistRetries is intentionally NOT set to Infinity
                        // so a persistent 403 (channel disabled) stops retrying.
                        ...(isLive && {
                            liveRangeSafeTimeDelta: 8,
                            maxPlaylistRetries: 5,
                            experimentalBufferBasedABR: false,
                        }),
                    },
                    nativeAudioTracks: false,
                    nativeVideoTracks: false,
                    nativeTextTracks: false,
                },
            }) as ExtendedPlayer;

            playerRef.current = player;

            const contentSource = { src, type: isHls ? "application/x-mpegURL" : "video/mp4" };

            // ── 1. IMA3 Ads (init before src so the pre-roll fires first) ──
            if (useClientSideAds) {
                player.ima({
                    adTagUrl: clientAdTagUrl,
                    timeout: (adConfig.timeout ?? 8) * 1000,
                    disableCustomPlaybackForIOS10Plus: true,
                    showCountdown: adConfig.showCountdown ?? true,
                    adWillAutoPlay: autoPlay,
                    adWillPlayMuted: muted,
                });

                // IMA3 ad lifecycle events fired by videojs-ima
                player.on("ads-ad-started", () => onAdStart?.());
                player.on("ads-ad-ended", () => onAdEnd?.());
                player.on("ads-skip", () => onAdSkip?.());
                player.on("adserror", () => onAdError?.());
            }

            // ── 2. Main content source ──────────────────────────────────────
            player.src(contentSource);

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
                    player.hlsQualitySelector({ displayCurrentQuality: true });
                });
            }

            // ── 4b. Forward / Backward skip buttons ──────────────────────────
            player.ready(() => {
                const controlBar = player.getChild("controlBar");
                if (!controlBar) return;

                // Helper to create skip button
                const createSkipButton = (direction: "forward" | "backward") => {
                    const button = document.createElement("button");
                    button.className = `vjs-control vjs-button vjs-skip-${direction}`;
                    button.setAttribute("type", "button");
                    button.setAttribute("aria-label", `Skip ${direction} ${skipSeconds}s`);
                    button.setAttribute("title", `${direction === "forward" ? "+" : "-"}${skipSeconds}s`);

                    const isForward = direction === "forward";
                    const forwardPath = "M11 5v3.5H8v2h5V5h-2zm5.5 2c-2.25 0-4.25 1.5-5 3.5H10c.75-3 3.5-5 6.5-5 3.87 0 7 3.13 7 7s-3.13 7-7 7-7-3.13-7-7h-2c0 4.97 4.03 9 9 9s9-4.03 9-9-4.03-9-9-9z";
                    const backwardPath = "M13 5v3.5h3v2h-5V5h2zm-5.5 2c2.25 0 4.25 1.5 5 3.5h2.5c-.75-3-3.5-5-6.5-5C2.63 5.5 0 8.63 0 12.5S2.63 19.5 6.5 19.5c3 0 5.75-2 6.5-5h-2.5c-.75 2-2.75 3.5-5 3.5-3.87 0-7-3.13-7-7s3.13-7 7-7z";

                    button.innerHTML = `
                        <span style="display: flex; align-items: center; gap: 0.4em; font-weight: 600; font-size: 0.9em;">
                            <svg viewBox="0 0 24 24" width="1.6em" height="1.6em" fill="currentColor" style="flex-shrink: 0;">
                                <path d="${isForward ? forwardPath : backwardPath}"/>
                            </svg>
                            <span>${isForward ? "+" : "-"}${skipSeconds}s</span>
                        </span>
                    `;

                    button.style.cssText = `
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        cursor: pointer;
                        padding: 0.5em 0.7em;
                        margin: 0 0.3em;
                        opacity: 0.85;
                        transition: opacity 0.2s ease, background-color 0.2s ease;
                        border-radius: 0.3em;
                        border: none;
                        background: transparent;
                        color: inherit;
                    `;

                    button.addEventListener("mouseenter", () => {
                        button.style.opacity = "1";
                        button.style.backgroundColor = "rgba(255, 255, 255, 0.15)";
                    });
                    button.addEventListener("mouseleave", () => {
                        button.style.opacity = "0.85";
                        button.style.backgroundColor = "transparent";
                    });

                    button.addEventListener("click", () => {
                        const currentTime = player.currentTime() ?? 0;
                        const duration = player.duration() ?? 0;

                        if (direction === "forward") {
                            player.currentTime(Math.min(currentTime + skipSeconds, duration));
                        } else {
                            player.currentTime(Math.max(currentTime - skipSeconds, 0));
                        }
                    });

                    return button;
                };

                // Insert skip buttons into the control bar
                const controlBarEl = controlBar.el() as HTMLElement;
                const spacer = controlBarEl?.querySelector(".vjs-spacer");
                if (spacer) {
                    const backwardBtn = createSkipButton("backward");
                    const forwardBtn = createSkipButton("forward");
                    spacer.parentNode?.insertBefore(backwardBtn, spacer);
                    spacer.parentNode?.insertBefore(forwardBtn, spacer.nextSibling);
                }
            });

            // ── 5. AES-128 DRM + channel-disabled guard ───────────────────
            //    VHS's beforeRequest / afterResponse hooks intercept all XHR.
            //    • DRM: inject Authorization header on /drm/key/ fetches.
            //    • Channel OFF guard: if nginx returns 403 on any HLS request
            //      (segment or playlist), immediately stop the player and fire
            //      onError — prevents the player from retrying forever.
            const _injectVhsHooks = () => {
                if (cancelled) return;
                const tech = player.tech(true) as any;
                const vhs = tech?.vhs ?? tech?.hls;
                if (!vhs?.xhr) return;

                if (resolvedDrmToken) {
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

                // Stop playback immediately when a segment or playlist returns 403
                vhs.xhr.onResponse = (request: any, error: any, response: any) => {
                    if (response?.statusCode === 403) {
                        player.pause();
                        player.reset();
                        onError?.("This channel is currently unavailable.");
                    }
                };
            };
            // Try once immediately (player.ready fires after tech is set up),
            // then re-try on every loadstart in case vhs.xhr wasn't available yet.
            player.ready(_injectVhsHooks);
            player.on("loadstart", _injectVhsHooks);

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

            // ── 8. Keyboard shortcuts for skip (arrow keys) ──────────────────
            const handleKeydown = (e: KeyboardEvent) => {
                if (!player || player.isDisposed?.()) return;

                // Only handle arrow keys when focus is on the video player
                const target = e.target as HTMLElement;
                if (target.tagName !== "BODY" && !containerRef.current?.contains(target)) return;

                const currentTime = player.currentTime() ?? 0;
                const duration = player.duration() ?? 0;

                if (e.key === "ArrowRight") {
                    e.preventDefault();
                    player.currentTime(Math.min(currentTime + skipSeconds, duration));
                } else if (e.key === "ArrowLeft") {
                    e.preventDefault();
                    player.currentTime(Math.max(currentTime - skipSeconds, 0));
                }
            };

            document.addEventListener("keydown", handleKeydown);
            keyboardHandlerRef.current = handleKeydown;
        };

        init().catch((err: unknown) => {
            if (!cancelled) {
                onError?.(err instanceof Error ? err.message : "Player failed to initialise.");
            }
        });

        return () => {
            cancelled = true;
            if (keyboardHandlerRef.current) {
                document.removeEventListener("keydown", keyboardHandlerRef.current);
                keyboardHandlerRef.current = null;
            }
            if (playerRef.current) {
                playerRef.current.dispose();
                playerRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [src, videoId, drmKeyToken, adConfig?.tagUrl, adConfig?.mode, skipSeconds]);

    return (
        <div
            ref={containerRef}
            className={`w-full overflow-hidden rounded-lg bg-black ${className}`}
            style={style}
            data-vjs-player
        />
    );
}

