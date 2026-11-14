/**
 * OttVideoPlayer
 *
 * Production-grade video player using react-native-video v6 (TheWidlarzGroup).
 *
 * ─── Streaming formats ────────────────────────────────────────────────────────
 *  HLS   (.m3u8)    iOS AVPlayer + Android ExoPlayer
 *  DASH  (.mpd)     Android ExoPlayer
 *  SmoothStreaming  Android ExoPlayer
 *  MP4              Both platforms
 *
 * ─── DRM ─────────────────────────────────────────────────────────────────────
 *  Widevine L1/L3           Android (MediaDrm via ExoPlayer)
 *  FairPlay Streaming       iOS (AVPlayer + certificate + license server)
 *  PlayReady                Android (selected devices via ExoPlayer)
 *
 * ─── Analytics ───────────────────────────────────────────────────────────────
 *  Events: PLAY_ATTEMPT → PLAY_START → QUARTILE_25/50/75/100 → PLAY_END
 *          BUFFER_START / BUFFER_END, SEEK_END, QUALITY_CHANGE, ERROR
 *  QoS:    startupLatencyMs, rebufferCount, totalRebufferMs, avgBitrateKbps
 *  Wire your backend once: registerAnalyticsDispatch(fn) at app startup.
 *
 * ─── Resume playback ─────────────────────────────────────────────────────────
 *  Priority: server progress > local AsyncStorage cache > startPositionSeconds
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Video, { DRMType } from "react-native-video";
import type {
  OnBandwidthUpdateData,
  OnBufferData,
  OnLoadData,
  OnPlaybackStateChangedData,
  OnProgressData,
  OnSeekData,
  OnVideoErrorData,
  VideoRef,
} from "react-native-video";
import { usePlaybackProgress } from "@/hooks/usePlaybackProgress";
import { createPlaybackSession, PlaybackAnalytics } from "@/services/analyticsService";
import { fetchDrmConfig, PlaybackSource } from "@/services/playbackService";
import { usePlayerStore } from "@/store/playerStore";
import { colors } from "@/theme/colors";

// ─── Props ────────────────────────────────────────────────────────────────────

interface OttVideoPlayerProps {
  contentId: string;
  source: PlaybackSource;
  /** Resume offset in seconds. Server progress takes precedence if higher. */
  startPositionSeconds?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PROGRESS_SYNC_INTERVAL_MS = 10_000;
const RESUME_THRESHOLD_SECONDS = 5;
const LOCAL_KEY = (id: string) => `sv:progress:${id}`;

// ─── Component ────────────────────────────────────────────────────────────────

export function OttVideoPlayer({ contentId, source, startPositionSeconds = 0 }: OttVideoPlayerProps) {
  const videoRef = useRef<VideoRef | null>(null);
  const analyticsRef = useRef<PlaybackAnalytics | null>(null);
  const hasSoughtRef = useRef(false);
  const lastSyncAtRef = useRef(0);
  const lastPosSec = useRef(0);
  const lastDurSec = useRef(0);

  const [drmReady, setDrmReady] = useState(!source.drmEnabled);
  const [drmError, setDrmError] = useState(false);
  const [drmToken, setDrmToken] = useState<string | null>(null);
  const [drmLicenseUrl, setDrmLicenseUrl] = useState<string | undefined>(undefined);
  const [drmFairplayCertUrl, setDrmFairplayCertUrl] = useState<string | undefined>(undefined);
  const [isBuffering, setIsBuffering] = useState(true);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [playerKey, setPlayerKey] = useState(0);

  const setLastPositionSeconds = usePlayerStore((s) => s.setLastPositionSeconds);
  const { progressQuery, syncMutation } = usePlaybackProgress(contentId);

  const serverPositionSeconds = progressQuery.data?.position_seconds ?? 0;
  const resumeSeconds = Math.max(startPositionSeconds, serverPositionSeconds);

  // ── Analytics session ──────────────────────────────────────────────────────
  useEffect(() => {
    analyticsRef.current = createPlaybackSession(contentId);
    return () => {
      analyticsRef.current?.endSession();
      const pos = lastPosSec.current;
      const dur = lastDurSec.current;
      if (pos > 0) {
        syncMutation.mutateAsync({ positionSeconds: pos, durationSeconds: dur }).catch(() => undefined);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentId]);

  // ── DRM token resolution ───────────────────────────────────────────────────
  useEffect(() => {
    if (!source.drmEnabled) {
      setDrmReady(true);
      return;
    }

    fetchDrmConfig(contentId)
      .then((cfg) => {
        if (!cfg?.licenseToken) {
          setDrmError(true);
        } else {
          setDrmToken(cfg.licenseToken);
          setDrmLicenseUrl(cfg.licenseServerUrl);
          setDrmFairplayCertUrl(cfg.fairplayCertificateUrl);
        }
        setDrmReady(true);
      })
      .catch(() => {
        setDrmError(true);
        setDrmReady(true);
      });
  }, [contentId, source.drmEnabled]);

  // ── Merge local cache with server progress ─────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(LOCAL_KEY(contentId))
      .then((raw) => {
        if (!raw) return;
        const local = Number(raw);
        if (!Number.isNaN(local) && local > serverPositionSeconds + 8) {
          syncMutation
            .mutateAsync({
              positionSeconds: local,
              durationSeconds: progressQuery.data?.duration_seconds ?? 0,
            })
            .catch(() => undefined);
        }
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentId, progressQuery.dataUpdatedAt]);

  // ── Event handlers ─────────────────────────────────────────────────────────

  function onLoad(data: OnLoadData): void {
    analyticsRef.current?.onLoad(data.duration * 1000);
    setIsBuffering(false);
    // Seek to resume position once after load (ExoPlayer/AVPlayer need a short defer)
    if (!hasSoughtRef.current && resumeSeconds > RESUME_THRESHOLD_SECONDS) {
      hasSoughtRef.current = true;
      setTimeout(() => {
        videoRef.current?.seek(resumeSeconds);
      }, 80);
    }
  }

  function onProgress(data: OnProgressData): void {
    const posMs = data.currentTime * 1000;
    const durMs = data.seekableDuration * 1000;

    lastPosSec.current = data.currentTime;
    lastDurSec.current = data.seekableDuration;
    setLastPositionSeconds(contentId, Math.floor(data.currentTime));

    // Local write — non-blocking, survives app force-kills
    AsyncStorage.setItem(LOCAL_KEY(contentId), String(Math.floor(data.currentTime))).catch(() => undefined);

    // Throttled server sync
    const now = Date.now();
    if (now - lastSyncAtRef.current > PROGRESS_SYNC_INTERVAL_MS && data.seekableDuration > 0) {
      lastSyncAtRef.current = now;
      syncMutation
        .mutateAsync({
          positionSeconds: Math.floor(data.currentTime),
          durationSeconds: Math.floor(data.seekableDuration),
        })
        .catch(() => undefined);
    }

    analyticsRef.current?.onProgress(posMs, durMs);
  }

  function onBuffer(data: OnBufferData): void {
    setIsBuffering(data.isBuffering);
    analyticsRef.current?.onBuffer(data.isBuffering);
  }

  function onBandwidthUpdate(data: OnBandwidthUpdateData): void {
    analyticsRef.current?.onBitrateChange(data.bitrate);
  }

  function onSeek(data: OnSeekData): void {
    analyticsRef.current?.onSeek(data.currentTime, data.seekTime);
  }

  function onEnd(): void {
    analyticsRef.current?.onEnd();
    syncMutation
      .mutateAsync({
        positionSeconds: Math.floor(lastDurSec.current),
        durationSeconds: Math.floor(lastDurSec.current),
      })
      .catch(() => undefined);
  }

  function onError(err: OnVideoErrorData): void {
    const code = String(err.error.errorCode ?? (err.error as { domain?: string }).domain ?? "UNKNOWN");
    const msg = (err.error as { localizedDescription?: string }).localizedDescription
      ?? err.error.errorString
      ?? "Playback error";
    analyticsRef.current?.onError(code, msg);
    setPlaybackError("We could not play this stream. Check your connection and try again.");
  }

  function onPlaybackStateChanged(data: OnPlaybackStateChangedData): void {
    analyticsRef.current?.onPlayStateChange(data.isPlaying);
  }

  // ── DRM config object for react-native-video ───────────────────────────────
  const drmConfig =
    source.drmEnabled && drmToken
      ? {
          type: Platform.OS === "ios" ? DRMType.FAIRPLAY : DRMType.WIDEVINE,
          licenseServer: drmLicenseUrl,
          headers: {
            Authorization: `Bearer ${drmToken}`,
            "Content-Type": "application/octet-stream",
          },
          ...(Platform.OS === "ios" && drmFairplayCertUrl
            ? { certificateUrl: drmFairplayCertUrl }
            : {}),
        }
      : undefined;

  const videoSource = {
    uri: source.uri,
    ...(drmConfig ? { drm: drmConfig } : {}),
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (!drmReady) {
    return (
      <View style={styles.stateWrap}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.stateMeta}>Preparing secure stream...</Text>
      </View>
    );
  }

  if (drmError) {
    return (
      <View style={styles.drmErrorWrap}>
        <Text style={styles.drmErrorTitle}>Playback unavailable</Text>
        <Text style={styles.drmErrorBody}>
          A DRM license could not be retrieved for this content. Please verify your subscription status and try again.
        </Text>
      </View>
    );
  }

  if (playbackError) {
    return (
      <View style={styles.drmErrorWrap}>
        <Text style={styles.drmErrorTitle}>Playback interrupted</Text>
        <Text style={styles.drmErrorBody}>{playbackError}</Text>
        <Text
          style={styles.retryText}
          onPress={() => {
            setPlaybackError(null);
            setIsBuffering(true);
            setPlayerKey((value) => value + 1);
          }}
        >
          Try again
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {isBuffering ? (
        <View style={styles.bufferOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.bufferText}>{source.protocol.toUpperCase()} • Buffering...</Text>
        </View>
      ) : null}

      <Video
        key={playerKey}
        ref={(node) => {
          videoRef.current = node;
        }}
        source={videoSource}
        style={styles.video}
        resizeMode="contain"
        controls
        progressUpdateInterval={1000}
        onLoad={onLoad}
        onProgress={onProgress}
        onBuffer={onBuffer}
        onBandwidthUpdate={onBandwidthUpdate}
        onSeek={onSeek}
        onEnd={onEnd}
        onError={onError}
        onPlaybackStateChanged={onPlaybackStateChanged}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  video: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
  },
  bufferOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.65)",
    gap: 8,
    zIndex: 10,
  },
  bufferText: {
    color: colors.textSecondary,
    fontSize: 12,
    letterSpacing: 0.4,
  },
  stateWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 30,
    gap: 8,
  },
  stateMeta: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  drmErrorWrap: {
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 14,
    gap: 6,
  },
  drmErrorTitle: {
    color: colors.danger,
    fontWeight: "700",
    fontSize: 16,
  },
  drmErrorBody: {
    color: colors.textSecondary,
    lineHeight: 19,
  },
  retryText: {
    color: colors.primaryStrong,
    fontWeight: "800",
    marginTop: 4,
  },
});
