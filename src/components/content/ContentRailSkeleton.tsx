import { ScrollView, StyleSheet, Text, View } from "react-native";
import { PosterCardSkeleton } from "@/components/content/PosterCardSkeleton";
import { colors } from "@/theme/colors";

interface ContentRailSkeletonProps {
  title: string;
}

export function ContentRailSkeleton({ title }: ContentRailSkeletonProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {Array.from({ length: 5 }).map((_, index) => (
          <PosterCardSkeleton key={`${title}-${index}`} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 20,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 19,
    fontWeight: "800",
    marginBottom: 12,
  },
});
