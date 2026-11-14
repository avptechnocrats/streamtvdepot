import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { ContentItem } from "@/types/models";
import { SkeletonBlock } from "@/components/common/SkeletonBlock";
import { TrailerPreview } from "@/components/content/TrailerPreview";
import { colors } from "@/theme/colors";

type CardVariant = "portrait" | "landscape" | "wider-landscape";

interface PosterCardProps {
  item: ContentItem;
  onPress: () => void;
  rank?: number;
  variant?: CardVariant;
  previewOnFocus?: boolean;
  previewActive?: boolean;
  showTitle?: boolean;
}

function sanitizeImageUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const lowered = trimmed.toLowerCase();
  if (lowered === "null" || lowered === "undefined") return undefined;
  return trimmed;
}

export function PosterCard({ item, onPress, rank, variant = "portrait", previewOnFocus = false, previewActive = true, showTitle = true }: PosterCardProps) {
  const [focused, setFocused] = useState(false);
  const image = (variant === "portrait"
    ? sanitizeImageUrl(item.thumbnails?.video_h_thumbnail) || sanitizeImageUrl(item.thumbnails?.video_w_thumbnail)
    : sanitizeImageUrl(item.thumbnails?.video_w_thumbnail) || sanitizeImageUrl(item.thumbnails?.video_h_thumbnail))
    || undefined;
  const trailer = sanitizeImageUrl(item.trailer_hls_url) || sanitizeImageUrl(item.trailer_display_url);
  const [imageLoaded, setImageLoaded] = useState(!image);

  useEffect(() => {
    setImageLoaded(!image);
  }, [image]);

  useEffect(() => {
    if (!previewActive) setFocused(false);
  }, [previewActive]);

  return (
    <Pressable
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[styles.card, variant === "landscape" && styles.cardLandscape, variant === "wider-landscape" && styles.cardWideLandscape]}
      accessibilityRole="button"
      accessibilityLabel={item.title}
    >
      <View style={[styles.imageFrame, variant === "landscape" && styles.imageFrameLandscape, variant === "wider-landscape" && styles.imageFrameWideLandscape]}>
        <Image
          source={image ? { uri: image } : undefined}
          style={[styles.poster, variant === "landscape" && styles.posterLandscape, variant === "wider-landscape" && styles.posterWideLandscape]}
          resizeMode="cover"
          progressiveRenderingEnabled
          fadeDuration={120}
          onLoadEnd={() => setImageLoaded(true)}
          onError={() => setImageLoaded(true)}
        />
        {!imageLoaded ? <SkeletonBlock style={styles.posterSkeleton} /> : null}
        <TrailerPreview
          source={previewOnFocus ? trailer : null}
          active={previewOnFocus && previewActive && focused}
          controlPosition="bottom-right"
        />
        {rank ? <Text style={styles.rank}>{rank}</Text> : null}
      </View>
      {showTitle ? (
        <View style={styles.meta}>
          <Text numberOfLines={1} style={styles.title}>
            {item.title}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 154,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 12,
  },
  cardLandscape: {
    width: 220,
  },
  cardWideLandscape: {
    width: 270,
  },
  imageFrame: {
    position: "relative",
  },
  poster: {
    width: "100%",
    height: 190,
    backgroundColor: colors.surfaceMuted,
  },
  posterLandscape: {
    height: 124,
  },
  posterWideLandscape: {
    height: 152,
  },
  imageFrameLandscape: {
    aspectRatio: 16 / 9,
  },
  imageFrameWideLandscape: {
    aspectRatio: 16 / 9,
  },
  posterSkeleton: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  rank: {
    position: "absolute",
    bottom: 4,
    left: 6,
    color: colors.textPrimary,
    fontSize: 34,
    fontWeight: "900",
    lineHeight: 38,
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  meta: {
    padding: 10,
  },
  title: {
    color: colors.textPrimary,
    fontWeight: "700",
  },
});
