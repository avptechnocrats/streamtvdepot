"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";

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

interface BannerTrailerProps {
  /** Original trailer file; used when there is no HLS preview or it fails. */
  src: string | null;
  /** Adaptive HLS preview, preferred when present. */
  hlsSrc?: string | null;
  /** True while the pointer is over the banner. */
  hovered: boolean;
  delayMs?: number;
  /** Matches the theme's artwork focal point, e.g. "object-[70%_30%]". */
  positionClassName?: string;
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
export function BannerTrailer({ src, hlsSrc = null, hovered, delayMs = HOVER_DELAY_MS, positionClassName = "" }: BannerTrailerProps) {
  const [mounted, setMounted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [mp4Fallback, setMp4Fallback] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const eligible = !!(src || hlsSrc) && !failed && canPlayTrailer();

  useEffect(() => {
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
    if (!mounted || !video) return;
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
      hls?.destroy();
    };
  }, [mounted, hlsSrc, src, mp4Fallback]);

  if (!eligible || !mounted) return null;

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      preload="auto"
      aria-hidden="true"
      onPlaying={() => setPlaying(true)}
      onEnded={() => setPlaying(false)}
      onError={() => (hlsSrc && src && !mp4Fallback ? setMp4Fallback(true) : setFailed(true))}
      className={`absolute inset-0 h-full w-full object-cover ${positionClassName} transition-opacity duration-500 ${playing && hovered ? "opacity-100" : "opacity-0"}`}
    />
  );
}
