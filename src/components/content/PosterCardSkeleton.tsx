import { StyleSheet, View } from "react-native";
import { SkeletonBlock } from "@/components/common/SkeletonBlock";
import { colors } from "@/theme/colors";

export function PosterCardSkeleton() {
  return (
    <View style={styles.card}>
      <SkeletonBlock style={styles.poster} />
      <View style={styles.meta}>
        <SkeletonBlock style={styles.title} />
        <SkeletonBlock style={styles.caption} />
      </View>
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
