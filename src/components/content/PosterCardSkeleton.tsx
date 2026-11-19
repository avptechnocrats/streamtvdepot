import { StyleSheet, View } from "react-native";
import { SkeletonBlock } from "@/components/common/SkeletonBlock";
import { colors } from "@/theme/colors";

interface PosterCardSkeletonProps {
  showMeta?: boolean;
  variant?: "portrait" | "landscape" | "wider-landscape" | "square";
}

export function PosterCardSkeleton({ showMeta = true, variant = "portrait" }: PosterCardSkeletonProps) {
  return (
    <View style={[styles.card, variant === "landscape" && styles.cardLandscape, variant === "wider-landscape" && styles.cardWideLandscape, variant === "square" && styles.cardSquare]}>
      <SkeletonBlock style={[styles.poster, variant === "landscape" && styles.posterLandscape, variant === "wider-landscape" && styles.posterWideLandscape, variant === "square" && styles.posterSquare]} />
      {showMeta ? (
        <View style={styles.meta}>
          <SkeletonBlock style={styles.title} />
          <SkeletonBlock style={styles.caption} />
        </View>
      ) : null}
    </View>
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
  poster: {
    width: "100%",
    height: 190,
  },
  cardLandscape: { width: 220 },
  cardWideLandscape: { width: 270 },
  cardSquare: { width: 94, borderRadius: 6 },
  posterLandscape: { height: 124 },
  posterWideLandscape: { height: 152 },
  posterSquare: { height: 94 },
  meta: {
    padding: 10,
    gap: 6,
  },
  title: {
    width: "85%",
    height: 14,
    borderRadius: 6,
  },
  caption: {
    width: "50%",
    height: 12,
    borderRadius: 6,
  },
});
