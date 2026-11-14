import { StyleSheet, View } from "react-native";
import { SkeletonBlock } from "@/components/common/SkeletonBlock";

export function HeroBannerSkeleton() {
  return (
    <View style={styles.banner}>
      <SkeletonBlock style={styles.kicker} />
      <SkeletonBlock style={styles.title} />
      <SkeletonBlock style={styles.desc} />
      <SkeletonBlock style={styles.button} />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    width: "100%",
    height: 300,
    borderRadius: 18,
    overflow: "hidden",
    marginTop: 12,
    padding: 18,
    justifyContent: "flex-end",
    gap: 10,
  },
  kicker: {
    width: 80,
    height: 12,
    borderRadius: 6,
  },
  title: {
    width: "75%",
    height: 30,
    borderRadius: 8,
  },
  desc: {
    width: "92%",
    height: 16,
    borderRadius: 8,
  },
  button: {
    marginTop: 4,
    width: 130,
    height: 42,
    borderRadius: 12,
  },
});
