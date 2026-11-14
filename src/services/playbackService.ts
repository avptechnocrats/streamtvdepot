import { apiClient } from "@/api/client";
import { ENDPOINTS } from "@/services/serviceEndpoints";
import { ContentItem, PlaybackProgress } from "@/types/models";

export type StreamProtocol = "hls" | "dash" | "mp4" | "unknown";

export interface PlaybackSource {
  uri: string;
  protocol: StreamProtocol;
  drmEnabled: boolean;
}

export interface DrmConfig {
  licenseToken: string;
  licenseServerUrl?: string;
  keyId?: string;
  /** FairPlay certificate URL (iOS only — required for FairPlay DRM) */
  fairplayCertificateUrl?: string;
}

export function buildPlaybackSource(content: ContentItem): PlaybackSource | null {
  const candidates = [content.hls_display_url, content.hls_url, content.video_display_url, content.video_url].filter(Boolean) as string[];
  if (!candidates.length) {
    return null;
  }

  const uri = candidates[0];
  const lc = uri.toLowerCase();
  let protocol: StreamProtocol = "unknown";

  if (lc.includes(".m3u8")) protocol = "hls";
  else if (lc.includes(".mpd")) protocol = "dash";
  else if (lc.includes(".mp4")) protocol = "mp4";

  return {
    uri,
    protocol,
    drmEnabled: Boolean(content.drm_enabled),
  };
}

export async function fetchDrmConfig(videoId: string): Promise<DrmConfig | null> {
  try {
    const { data } = await apiClient.get<{ token: string; license_server_url?: string; key_id?: string }>(
      ENDPOINTS.drm.keyToken(videoId),
    );

    return {
      licenseToken: data.token,
      licenseServerUrl: data.license_server_url,
      keyId: data.key_id,
      fairplayCertificateUrl: (data as { fairplay_certificate_url?: string }).fairplay_certificate_url,
    };
  } catch {
    return null;
  }
}

const progressReadPaths = [
  (contentId: string) => `/auth/user/playback-progress/${contentId}`,
  (contentId: string) => `/auth/user/watch-progress/${contentId}`,
];

const progressWritePaths = [
  (contentId: string) => `/auth/user/playback-progress/${contentId}`,
  (contentId: string) => `/auth/user/watch-progress/${contentId}`,
];

export async function fetchPlaybackProgress(contentId: string): Promise<PlaybackProgress | null> {
  for (const pathBuilder of progressReadPaths) {
    try {
      const { data } = await apiClient.get<PlaybackProgress>(pathBuilder(contentId));
      return data;
    } catch {
      continue;
    }
  }
  return null;
}

export async function syncPlaybackProgress(payload: {
  contentId: string;
  positionSeconds: number;
  durationSeconds: number;
}): Promise<void> {
  const requestBody = {
    position_seconds: payload.positionSeconds,
    duration_seconds: payload.durationSeconds,
  };

  for (const pathBuilder of progressWritePaths) {
    try {
      await apiClient.put(pathBuilder(payload.contentId), requestBody);
      return;
    } catch {
      continue;
    }
  }
}
