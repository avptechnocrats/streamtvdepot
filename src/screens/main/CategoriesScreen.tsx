import { useQuery } from "@tanstack/react-query";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Screen } from "@/components/common/Screen";
import { SkeletonBlock } from "@/components/common/SkeletonBlock";
import { fetchCategories } from "@/services/categoryService";
import { colors } from "@/theme/colors";

export function CategoriesScreen() {
  const { data = [], isLoading } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });

  return (
    <Screen>
      <Text style={styles.title}>Categories</Text>
      {isLoading ? (
        <View style={styles.grid}>
          {Array.from({ length: 12 }).map((_, index) => (
            <SkeletonBlock key={`cat-skeleton-${index}`} style={styles.pillSkeleton} />
          ))}
        </View>
      ) : null}
      <View style={styles.grid}>
        {data.map((category) => (
          <Pressable key={category.id} style={styles.pill}>
            <Text style={styles.pillText}>{category.name}</Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: "800",
    marginTop: 16,
    marginBottom: 14,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillText: {
    color: colors.textPrimary,
    fontWeight: "600",
  },
  pillSkeleton: {
    width: 110,
    height: 34,
    borderRadius: 999,
  },
});
