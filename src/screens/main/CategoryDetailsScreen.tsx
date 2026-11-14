import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { BackTitleHeader } from "@/components/common/BackTitleHeader";
import { PosterCard } from "@/components/content/PosterCard";
import { PosterCardSkeleton } from "@/components/content/PosterCardSkeleton";
import { Screen } from "@/components/common/Screen";
import { RootStackParamList } from "@/navigation/types";
import { fetchHomeRows } from "@/services/homeService";
import { colors } from "@/theme/colors";
import { dedupeContentItems } from "@/utils/contentList";

type Props = NativeStackScreenProps<RootStackParamList, "CategoryDetails">;
type ContentTab = "movies" | "tv";

export function CategoryDetailsScreen({ route, navigation }: Props) {
  const { categoryId, categoryName, categorySlug } = route.params;
  const [activeTab, setActiveTab] = useState<ContentTab>("movies");

  const contentType = activeTab === "movies" ? "movie" : "video";

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["category-details", categoryId, categorySlug, categoryName, contentType],
    queryFn: () => fetchHomeRows({ contentType, page: 1, pageSize: 24, itemsPerRow: 24 }),
    staleTime: 5 * 60 * 1000,
  });

  const filteredRows = useMemo(() => {
    const nameNeedle = categoryName.trim().toLowerCase();
    const slugNeedle = (categorySlug || "").trim().toLowerCase();

    return rows.filter((row) => {
      const rowName = row.category_name.trim().toLowerCase();
      const rowSlug = row.category_slug.trim().toLowerCase();
      const idMatch = categoryId ? row.category_id === categoryId : false;
      const nameMatch = rowName.includes(nameNeedle) || nameNeedle.includes(rowName);
      const slugMatch = slugNeedle ? rowSlug === slugNeedle || rowSlug.includes(slugNeedle) : false;
      return idMatch || nameMatch || slugMatch;
    });
  }, [rows, categoryId, categoryName, categorySlug]);

  const visibleRows = filteredRows.length ? filteredRows : rows;

  return (
    <Screen>
      <BackTitleHeader title={categoryName} onBack={() => navigation.goBack()} />

      <View style={styles.tabsRow}>
        <Pressable
          style={[styles.tabBtn, activeTab === "movies" && styles.tabBtnActive]}
          onPress={() => setActiveTab("movies")}
        >
          <Text style={[styles.tabText, activeTab === "movies" && styles.tabTextActive]}>Movies</Text>
        </Pressable>
        <Pressable
          style={[styles.tabBtn, activeTab === "tv" && styles.tabBtnActive]}
          onPress={() => setActiveTab("tv")}
        >
          <Text style={[styles.tabText, activeTab === "tv" && styles.tabTextActive]}>TV shows</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.loadingRow}>
          {Array.from({ length: 3 }).map((_, index) => (
            <View key={`cat-row-skeleton-${index}`} style={styles.loadingCard}>
              <PosterCardSkeleton />
            </View>
          ))}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.contentWrap}>
          {visibleRows.map((row) => {
            const items = dedupeContentItems(row.items);
            if (!items.length) return null;

            return (
              <View key={row.category_id} style={styles.sectionWrap}>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle}>{row.category_name}</Text>
                  <MaterialCommunityIcons name="chevron-right" size={18} color={colors.textSecondary} />
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowContent}>
                  {items.map((item) => (
                    <PosterCard
                      key={`${row.category_id}-${item.id}`}
                      item={item}
                      onPress={() => navigation.navigate("ContentDetails", { contentId: item.id })}
                    />
                  ))}
                </ScrollView>
              </View>
            );
          })}

          {!visibleRows.length ? <Text style={styles.emptyText}>No content available.</Text> : null}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabsRow: {
    marginTop: 12,
    flexDirection: "row",
    gap: 12,
  },
  tabBtn: {
    minHeight: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBtnActive: {
    borderColor: "rgba(255,255,255,0.35)",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  tabText: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: "700",
  },
  tabTextActive: {
    color: colors.textPrimary,
  },
  loadingRow: {
    marginTop: 18,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  loadingCard: {
    width: "31%",
  },
  contentWrap: {
    paddingTop: 14,
    paddingBottom: 20,
    gap: 14,
  },
  sectionWrap: {
    gap: 8,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
  },
  rowContent: {
    paddingRight: 8,
  },
  emptyText: {
    marginTop: 18,
    color: colors.textSecondary,
  },
});
