export const ENDPOINTS = {
  drm: {
    keyToken: (videoId: string) => `/drm/key-token/${videoId}`,
  },
} as const;
