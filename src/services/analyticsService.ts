/**
 * SignalView Playback Analytics
 *
 * Architecture modelled after Conviva / Mux Data / Nielsen's session-scoped model.
 *
 * ─── Event taxonomy ──────────────────────────────────────────────────────────
 *  PLAY_ATTEMPT   Session created, stream URL resolved
 *  PLAY_START     First frame rendered (≈ startup time baseline)
 *  PLAY_PAUSE     User or system pause
 *  PLAY_RESUME    Resuming after pause
 *  PLAY_END       Reached end or session unmounted after significant play
 *  BUFFER_START   ABR stall / initial buffer
 *  BUFFER_END     Playback resumed after buffer
 *  SEEK_END       Seek operation completed (RN video fires one event per seek)
 *  QUALITY_CHANGE Bitrate or resolution changed by ABR algorithm
 *  QUARTILE_25/50/75/100  Content milestones
 *  ERROR          Playback error with code and message
 *
 * ─── Integration ─────────────────────────────────────────────────────────────
 *  Call `registerAnalyticsDispatch()` once at app startup to wire to your
 *  analytics backend (Segment, Mux, Conviva, custom API, etc.).
 *
 *  Default behaviour: development console logging, production no-op.
 *
 * ─── Per-session QoS metrics ─────────────────────────────────────────────────
 *  startupLatencyMs   — time from PLAY_ATTEMPT to first frame
 *  rebufferCount      — number of distinct buffer stalls
 *  totalRebufferMs    — cumulative stall duration
 *  avgBitrateKbps     — average of all ABR bitrate values during session
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Allow TypeScript to know about React Native's __DEV__ global
declare const __DEV__: boolean;

// ─── Types ────────────────────────────────────────────────────────────────────

export type PlaybackEventType =
  | "PLAY_ATTEMPT"
  | "PLAY_START"
  | "PLAY_PAUSE"
  | "PLAY_RESUME"
  | "PLAY_END"
  | "BUFFER_START"
  | "BUFFER_END"
  | "SEEK_END"
  | "QUALITY_CHANGE"
  | "QUARTILE_25"
  | "QUARTILE_50"
  | "QUARTILE_75"
  | "QUARTILE_100"
  | "ERROR";

export interface PlaybackEventPayload {
  /** Uniquely identifies this viewing session */
  sessionId: string;
  contentId: string;
  eventType: PlaybackEventType;
  /** Current playback position in ms */
  positionMs: number;
  /** Total content duration in ms (0 if unknown yet) */
  durationMs: number;
  /** Unix epoch ms */
  timestamp: number;
  /** Current ABR bitrate in bps (quality change / session end) */
  bitrate?: number;
  /** Seek target position in ms */
  seekTargetMs?: number;
  /** Platform error code string */
  errorCode?: string;
  errorMessage?: string;
  // ── Session-level QoS fields — populated on PLAY_START and PLAY_END ──────
  startupLatencyMs?: number;
  rebufferCount?: number;
  totalRebufferMs?: number;
  avgBitrateKbps?: number;
}

type AnalyticsDispatch = (event: PlaybackEventPayload) => void;

// ─── Global dispatch registration ─────────────────────────────────────────────

let _dispatch: AnalyticsDispatch | null = null;

/**
 * Call once at app startup to wire analytics events to your platform.
 *
 * @example
 * // Mux Data
 * registerAnalyticsDispatch((e) => mux.dispatch('videochange', e));
 *
 * @example
 * // Segment
 * registerAnalyticsDispatch((e) => analytics.track(e.eventType, e));
 *
 * @example
 * // Custom API (fire-and-forget)
 * registerAnalyticsDispatch((e) =>
 *   apiClient.post('/analytics/playback', e).catch(() => undefined)
 * );
 */
export function registerAnalyticsDispatch(fn: AnalyticsDispatch): void {
  _dispatch = fn;
}

// ─── Session ──────────────────────────────────────────────────────────────────

function generateSessionId(): string {
  return `sv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export class PlaybackAnalytics {
  private readonly sessionId: string;
  private readonly contentId: string;
  private readonly attemptedAt: number;

  private startedAt: number | null = null;
  private bufferStartAt: number | null = null;
  private currentPositionMs = 0;
  private currentDurationMs = 0;
  private currentBitrate = 0;

  private rebufferCount = 0;
  private totalRebufferMs = 0;
  private bitrateSum = 0;
  private bitrateReadings = 0;
  private quartilesFired = new Set<string>();

  constructor(contentId: string) {
    this.contentId = contentId;
    this.sessionId = generateSessionId();
    this.attemptedAt = Date.now();
    this.send({ eventType: "PLAY_ATTEMPT", positionMs: 0, durationMs: 0 });
  }

  /** Call when first frame is ready to display */
  onLoad(durationMs: number): void {
    this.startedAt = Date.now();
    this.currentDurationMs = durationMs;
    this.send({
      eventType: "PLAY_START",
      positionMs: 0,
      durationMs,
      startupLatencyMs: this.startedAt - this.attemptedAt,
    });
  }

  /** Call from react-native-video onProgress — fires every progressUpdateInterval ms */
  onProgress(positionMs: number, durationMs: number): void {
    this.currentPositionMs = positionMs;
    if (durationMs > 0) this.currentDurationMs = durationMs;
    if (!durationMs) return;

    const pct = positionMs / durationMs;
    if (pct >= 0.25 && !this.quartilesFired.has("25")) {
      this.quartilesFired.add("25");
      this.send({ eventType: "QUARTILE_25", positionMs, durationMs });
    }
    if (pct >= 0.5 && !this.quartilesFired.has("50")) {
      this.quartilesFired.add("50");
      this.send({ eventType: "QUARTILE_50", positionMs, durationMs });
    }
    if (pct >= 0.75 && !this.quartilesFired.has("75")) {
      this.quartilesFired.add("75");
      this.send({ eventType: "QUARTILE_75", positionMs, durationMs });
    }
  }

  /** Call from react-native-video onBuffer */
  onBuffer(isBuffering: boolean): void {
    if (isBuffering) {
      if (!this.bufferStartAt) {
        this.bufferStartAt = Date.now();
        this.send({ eventType: "BUFFER_START", positionMs: this.currentPositionMs, durationMs: this.currentDurationMs });
      }
    } else if (this.bufferStartAt) {
      const duration = Date.now() - this.bufferStartAt;
      this.rebufferCount += 1;
      this.totalRebufferMs += duration;
      this.bufferStartAt = null;
      this.send({ eventType: "BUFFER_END", positionMs: this.currentPositionMs, durationMs: this.currentDurationMs });
    }
  }

  /** Call from react-native-video onPlaybackStateChanged */
  onPlayStateChange(isPlaying: boolean): void {
    this.send({
      eventType: isPlaying ? "PLAY_RESUME" : "PLAY_PAUSE",
      positionMs: this.currentPositionMs,
      durationMs: this.currentDurationMs,
    });
  }

  /** Call from react-native-video onSeek */
  onSeek(currentTimeSec: number, seekTimeSec: number): void {
    this.send({
      eventType: "SEEK_END",
      positionMs: Math.round(currentTimeSec * 1000),
      durationMs: this.currentDurationMs,
      seekTargetMs: Math.round(seekTimeSec * 1000),
    });
  }

  /** Call from react-native-video onBandwidthUpdate — ABR quality change */
  onBitrateChange(bitrateBps: number): void {
    if (bitrateBps <= 0 || bitrateBps === this.currentBitrate) return;
    this.currentBitrate = bitrateBps;
    this.bitrateSum += bitrateBps;
    this.bitrateReadings += 1;
    this.send({
      eventType: "QUALITY_CHANGE",
      positionMs: this.currentPositionMs,
      durationMs: this.currentDurationMs,
      bitrate: bitrateBps,
    });
  }

  /** Call from react-native-video onEnd */
  onEnd(): void {
    if (!this.quartilesFired.has("100")) {
      this.quartilesFired.add("100");
      this.send({ eventType: "QUARTILE_100", positionMs: this.currentDurationMs, durationMs: this.currentDurationMs });
    }
    this.sendSessionEnd();
  }

  /** Call from react-native-video onError */
  onError(errorCode: string, errorMessage: string): void {
    this.send({
      eventType: "ERROR",
      positionMs: this.currentPositionMs,
      durationMs: this.currentDurationMs,
      errorCode,
      errorMessage,
    });
  }

  /**
   * Called on component unmount to flush final state.
   * If onEnd was already fired this is a no-op (due to position check).
   */
  endSession(): void {
    if (this.bufferStartAt) {
      this.totalRebufferMs += Date.now() - this.bufferStartAt;
      this.bufferStartAt = null;
    }
    // Only emit PLAY_END if meaningful watch time has accumulated (>3 s)
    if (this.currentPositionMs > 3000) {
      this.sendSessionEnd();
    }
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private sendSessionEnd(): void {
    this.send({
      eventType: "PLAY_END",
      positionMs: this.currentPositionMs,
      durationMs: this.currentDurationMs,
      startupLatencyMs: this.startedAt ? this.startedAt - this.attemptedAt : undefined,
      rebufferCount: this.rebufferCount,
      totalRebufferMs: this.totalRebufferMs,
      avgBitrateKbps:
        this.bitrateReadings > 0
          ? Math.round(this.bitrateSum / this.bitrateReadings / 1000)
          : undefined,
    });
  }

  private send(
    partial: Omit<PlaybackEventPayload, "sessionId" | "contentId" | "timestamp">,
  ): void {
    const event: PlaybackEventPayload = {
      sessionId: this.sessionId,
      contentId: this.contentId,
      timestamp: Date.now(),
      ...partial,
    };

    // ── External dispatch (Mux / Segment / Conviva / custom API) ──────────
    if (_dispatch) {
      try {
        _dispatch(event);
      } catch {
        // Never let analytics crash playback
      }
      return;
    }

    // ── Dev console fallback ───────────────────────────────────────────────
    if (__DEV__) {
      const pos = `${(event.positionMs / 1000).toFixed(1)}s`;
      const extras: Record<string, unknown> = { pos, sid: event.sessionId.slice(-6) };
      if (event.bitrate) extras.bitrate = `${Math.round(event.bitrate / 1000)}kbps`;
      if (event.errorCode) extras.err = event.errorCode;
      if (event.rebufferCount != null) extras.rebuffers = event.rebufferCount;
      if (event.avgBitrateKbps) extras.avgKbps = event.avgBitrateKbps;
      if (event.startupLatencyMs) extras.startupMs = event.startupLatencyMs;
      console.log(`[Analytics] ${event.eventType}`, extras);
    }
  }
}

export function createPlaybackSession(contentId: string): PlaybackAnalytics {
  return new PlaybackAnalytics(contentId);
}
