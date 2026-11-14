import { Image } from "react-native";
import { ContentItem } from "@/types/models";

export function dedupeContentItems(items: ContentItem[]): ContentItem[] {
  const seen = new Set<string>();
  const unique: ContentItem[] = [];

  for (const item of items) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    unique.push(item);
  }

  return unique;
}

export function prefetchContentImages(items: ContentItem[], limit = 16): void {
  const unique = dedupeContentItems(items);

  unique.slice(0, limit).forEach((item) => {
    const imageUrl = item.thumbnails?.video_h_thumbnail || item.thumbnails?.video_w_thumbnail || item.thumbnails?.video_banner;
    if (imageUrl) {
      Image.prefetch(imageUrl).catch(() => undefined);
    }
  });
}