import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { BackTitleHeader } from "@/components/common/BackTitleHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { PosterCard } from "@/components/content/PosterCard";
import { PosterCardSkeleton } from "@/components/content/PosterCardSkeleton";
import { Screen } from "@/components/common/Screen";
import { RootStackParamList } from "@/navigation/types";
import { fetchHomeRows } from "@/services/homeService";
import { colors } from "@/theme/colors";
import { dedupeContentItems } from "@/utils/contentList";

type Props = NativeStackScreenProps<RootStackParamList, "CategoryDetails">;
type ContentTab = "movies" | "series";

export function CategoryDetailsScreen({ route, navigation }: Props) {
  const { categoryId, categoryName, categorySlug } = route.params;
  const [activeTab, setActiveTab] = useState<ContentTab>("movies");

  const contentType = activeTab === "movies" ? "video" : "series";

  const { data: rows = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["category-details", categoryId, categorySlug, categoryName, contentType],
    queryFn: () => fetchHomeRows({ contentType, page: 1, pageSize: 20, itemsPerRow: 24 }),
    staleTime: 5 * 60 * 1000,
  });

  const filteredRows = useMemo(() => {
    const nameNeedle = categoryName.trim().toLowerCase();
    const slugNeedle = (categorySlug || "").trim().toLowerCase();

    return rows.filter((row) => {
      const rowName = row.category_name.trim().toLowerCase();
      const rowSlug = row.category_slug.trim().toLowerCase();
      if (categoryId) return row.category_id === categoryId;
      if (slugNeedle) return rowSlug === slugNeedle;
      return rowName === nameNeedle;
    });
  }, [rows, categoryId, categoryName, categorySlug]);

  return (
    <Screen scroll={false} contentStyle={styles.screen}>
      <BackTitleHeader title={categoryName} onBack={() => navigation.goBack()} />

      <View style={styles.tabsRow}>
        <Pressable
          style={[styles.tabBtn, activeTab === "movies" && styles.tabBtnActive]}
          onPress={() => setActiveTab("movies")}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === "movies" }}
        >
          <MaterialCommunityIcons name="movie-outline" size={18} color={activeTab === "movies" ? colors.primaryStrong : colors.textSecondary} />
          <Text style={[styles.tabText, activeTab === "movies" && styles.tabTextActive]}>Movies</Text>
        </Pressable>
        <Pressable
          style={[styles.tabBtn, activeTab === "series" && styles.tabBtnActive]}
          onPress={() => setActiveTab("series")}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === "series" }}
        >
          <MaterialCommunityIcons name="television-play" size={18} color={activeTab === "series" ? colors.primaryStrong : colors.textSecondary} />
          <Text style={[styles.tabText, activeTab === "series" && styles.tabTextActive]}>TV shows</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.loadingRow}>
          {Array.from({ length: 3 }).map((_, index) => (
            <View key={`cat-row-skeleton-${index}`}>
              <PosterCardSkeleton />
            </View>
          ))}
        </View>
      ) : isError ? (
        <EmptyState icon="alert-circle-outline" title="Unable to load this collection" message="Check your connection and try again." actionLabel="Try Again" actionIcon="refresh" onAction={() => { void refetch(); }} />
      ) : (
        <ScrollView contentContainerStyle={styles.contentWrap} showsVerticalScrollIndicator={false}>
          {filteredRows.map((row) => {
            const items = dedupeContentItems(row.items);
            if (!items.length) return null;

            return (
              <View key={row.category_id} style={styles.sectionWrap}>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle}>{row.category_name}</Text>
                  <Text style={styles.itemCount}>{items.length} {items.length === 1 ? "title" : "titles"}</Text>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowContent}>
                  {items.map((item) => (
                    <PosterCard
                      key={`${row.category_id}-${item.id}`}
                      item={item}
                      onPress={() => row.content_type === "series"
                        ? navigation.navigate("SeriesDetails", { seriesId: item.id })
                        : navigation.navigate("ContentDetails", { contentId: item.id })}
                    />
                  ))}
                </ScrollView>
              </View>
            );
          })}

          {!filteredRows.length ? (
            <EmptyState
              icon={activeTab === "movies" ? "movie-open-outline" : "television-play"}
              title={`No ${activeTab === "movies" ? "movies" : "TV shows"} in this collection`}
              message="Try the other tab to explore more titles."
            />
          ) : null}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  tabsRow: {
    marginTop: 14,
    marginBottom: 8,
    padding: 4,
    flexDirection: "row",
    gap: 4,
    borderRadius: 6,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  tabBtnActive: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  tabTextActive: {
    color: colors.textPrimary,
  },
  loadingRow: {
    flex: 1,
    paddingTop: 12,
    flexDirection: "row",
  },
  contentWrap: {
    paddingTop: 12,
    paddingBottom: 28,
    gap: 20,
  },
  sectionWrap: {
    gap: 10,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  itemCount: { color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
  rowContent: {
    paddingRight: 8,
  },
  emptyText: {
    marginTop: 18,
    color: colors.textSecondary,
  },
});
