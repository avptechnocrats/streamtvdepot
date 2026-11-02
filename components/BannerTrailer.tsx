"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Volume2, VolumeX } from "lucide-react";

const HOVER_DELAY_MS = 600;
const FADE_MS = 500;
const STARTUP_TIMEOUT_MS = 10_000;

/** Hover state for a banner; touch input is ignored so a tap never starts a trailer. */
export function useBannerHover() {
  const [hovered, setHovered] = useState(false);
  const hoverProps = {
    onPointerEnter: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse") setHovered(true);
    },
    onPointerLeave: () => setHovered(false),
  };
  return { hovered, hoverProps };
}

export function useBannerAutoplay() {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!element) return;
    let inView = false;
    const update = () => setActive(inView && document.visibilityState === "visible" && document.hasFocus());
    const deactivate = () => setActive(false);
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting && entry.intersectionRatio >= 0.5;
      update();
    }, { threshold: [0, 0.5] });
    observer.observe(element);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    window.addEventListener("blur", deactivate);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", deactivate);
    };
  }, [element]);

  return { active, bannerRef: setElement };
}

interface BannerTrailerProps {
  /** Original trailer file; used when there is no HLS preview or it fails. */
  src: string | null;
  /** Adaptive HLS preview, preferred when present. */
  hlsSrc?: string | null;
  /** Whether the banner currently permits trailer playback. */
  hovered: boolean;
  delayMs?: number;
  /** Matches the theme's artwork focal point, e.g. "object-[70%_30%]". */
  positionClassName?: string;
  showSoundControl?: boolean;
  soundControlPlacement?: "top-right" | "bottom-right";
  soundControlTopInset?: number;
}

function canPlayTrailer() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return !connection?.saveData;
}

/**
 * Fades a muted trailer in over the slide artwork once the pointer has rested on the banner,
 * and fades it back out when the pointer leaves. Key it by slide id so state resets per slide.
 */
export function BannerTrailer({ src, hlsSrc = null, hovered, delayMs = HOVER_DELAY_MS, positionClassName = "", showSoundControl = false, soundControlPlacement = "top-right", soundControlTopInset = 12 }: BannerTrailerProps) {
  const [mounted, setMounted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [mp4Fallback, setMp4Fallback] = useState(false);
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  const eligible = !!(src || hlsSrc) && !failed && canPlayTrailer();

  useEffect(() => {
    if (!hovered) {
      setMuted(true);
      if (videoRef.current) videoRef.current.muted = true;
    }
    if (!eligible) return;
    if (hovered) {
      const timer = setTimeout(() => setMounted(true), delayMs);
      return () => clearTimeout(timer);
    }
    setPlaying(false);
    const timer = setTimeout(() => setMounted(false), FADE_MS);
    return () => clearTimeout(timer);
  }, [eligible, hovered, delayMs]);

  // Autoplay can be blocked silently, so give up if no frame appears in time.
  useEffect(() => {
    if (!mounted || playing || !hovered) return;
    const timer = setTimeout(() => setFailed(true), STARTUP_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [mounted, playing, hovered]);

  // Attach the stream: native HLS on Safari, hls.js (loaded on demand) elsewhere, else the original file.
  useEffect(() => {
    const video = videoRef.current;
    if (!mounted || !video || !hovered) return;
    let cancelled = false;
    let hls: { destroy: () => void } | null = null;

    const playFile = () => {
      if (cancelled || !src) return;
      video.src = src;
      void video.play().catch(() => {});
    };

    if (!hlsSrc || mp4Fallback) {
      playFile();
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = hlsSrc;
      void video.play().catch(() => {});
    } else {
      import("hls.js")
        .then(({ default: Hls }) => {
          if (cancelled) return;
          if (!Hls.isSupported()) {
            setMp4Fallback(true);
            return;
          }
          const instance = new Hls({ capLevelToPlayerSize: true, maxBufferLength: 12 });
          hls = instance;
          instance.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal && !cancelled) setMp4Fallback(true);
          });
          instance.on(Hls.Events.MANIFEST_PARSED, () => void video.play().catch(() => {}));
          instance.loadSource(hlsSrc);
          instance.attachMedia(video);
        })
        .catch(() => !cancelled && setMp4Fallback(true));
    }

    return () => {
      cancelled = true;
      video.pause();
      hls?.destroy();
    };
  }, [mounted, hovered, hlsSrc, src, mp4Fallback]);

  if (!eligible || !mounted) return null;

  return <>
    <video
      ref={videoRef}
      muted={muted}
      playsInline
      preload="auto"
      aria-hidden="true"
      onPlaying={event => {
        if (hovered) setPlaying(true);
        else event.currentTarget.pause();
      }}
      onEnded={() => setPlaying(false)}
      onVolumeChange={event => setMuted(event.currentTarget.muted)}
      onError={() => (hlsSrc && src && !mp4Fallback ? setMp4Fallback(true) : setFailed(true))}
      className={`absolute inset-0 h-full w-full object-cover ${positionClassName} transition-opacity duration-500 ${playing && hovered ? "opacity-100" : "opacity-0"}`}
    />
    {showSoundControl && playing && hovered && <button
      type="button"
      aria-label={muted ? "Unmute trailer" : "Mute trailer"}
      title={muted ? "Unmute trailer" : "Mute trailer"}
      aria-pressed={!muted}
      onClick={event => {
        event.preventDefault();
        event.stopPropagation();
        const video = videoRef.current;
        if (!video) return;
        video.muted = !video.muted;
        setMuted(video.muted);
      }}
      style={{ borderRadius: "50%", top: soundControlPlacement === "top-right" ? soundControlTopInset : undefined, bottom: soundControlPlacement === "bottom-right" ? "32px" : undefined }}
      className="pointer-events-auto absolute right-3 z-20 flex h-8 w-8 items-center justify-center rounded-full border-0 bg-white/20 text-white backdrop-blur-sm transition-colors hover:bg-white/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      {muted ? <VolumeX size={16} strokeWidth={2.5} aria-hidden="true" /> : <Volume2 size={16} strokeWidth={2.5} aria-hidden="true" />}
    </button>}
  </>;
}
