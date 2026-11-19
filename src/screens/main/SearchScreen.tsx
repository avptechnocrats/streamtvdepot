import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import { PageTitleHeader } from "@/components/common/PageTitleHeader";
import { Screen } from "@/components/common/Screen";
import { PosterCard } from "@/components/content/PosterCard";
import { PosterCardSkeleton } from "@/components/content/PosterCardSkeleton";
import { fetchCategories } from "@/services/categoryService";
import { fetchLiveTvChannels, fetchMovies } from "@/services/contentService";
import { RootStackParamList } from "@/navigation/types";
import { ContentItem } from "@/types/models";
import { colors } from "@/theme/colors";
import { dedupeContentItems, prefetchContentImages } from "@/utils/contentList";

export function SearchScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [query, setQuery] = useState("");
  const [showAllGenres, setShowAllGenres] = useState(false);
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories, staleTime: 10 * 60 * 1000 });
  const { data: movies = [], isLoading: moviesLoading } = useQuery({ queryKey: ["movies"], queryFn: fetchMovies, staleTime: 5 * 60 * 1000 });
  const { data: liveTv = [], isLoading: liveTvLoading } = useQuery({ queryKey: ["live-tv"], queryFn: fetchLiveTvChannels, staleTime: 5 * 60 * 1000 });

  const merged = useMemo(() => {
    return dedupeContentItems([...movies, ...liveTv]);
  }, [movies, liveTv]);

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return merged;
    return merged.filter((item) => item.title.toLowerCase().includes(trimmed));
  }, [merged, query]);

  const isLoading = moviesLoading || liveTvLoading;
  const showDiscovery = query.trim().length === 0;

  const visibleGenres = useMemo(() => {
    if (showAllGenres) return categories;
    return categories.slice(0, 6);
  }, [categories, showAllGenres]);

  const featuredCollections = useMemo(() => categories.filter((category) => category.content_types?.includes("video")).slice(0, 5), [categories]);

  useEffect(() => {
    if (!showDiscovery) {
      prefetchContentImages(filtered, 18);
    }
  }, [filtered, showDiscovery]);

  return (
    <Screen scroll={false} contentStyle={styles.wrap}>
      <PageTitleHeader title="Search" />
      <View style={styles.inputWrap}>
        <MaterialCommunityIcons name="magnify" size={22} color={colors.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search movies and live TV"
          placeholderTextColor={colors.textSecondary}
          style={styles.input}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Search movies and live TV"
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery("")} style={styles.clearButton} accessibilityRole="button" accessibilityLabel="Clear search">
            <MaterialCommunityIcons name="close-circle" size={20} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      {showDiscovery ? (
        <ScrollView contentContainerStyle={styles.discovery} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeading}>Browse genres</Text>
            {categories.length ? <Text style={styles.sectionMeta}>{categories.length}</Text> : null}
          </View>
          <View style={styles.genreGrid}>
            {visibleGenres.map((category) => (
              <Pressable
                key={category.id}
                style={styles.genreItem}
                onPress={() => navigation.navigate("CategoryDetails", { categoryId: category.id, categoryName: category.name, categorySlug: category.slug })}
                accessibilityRole="button"
              >
                <View style={styles.genreIcon}>
                  <MaterialCommunityIcons name="movie-filter-outline" size={18} color={colors.primaryStrong} />
                </View>
                <Text style={styles.genreText} numberOfLines={1}>{category.name}</Text>
              </Pressable>
            ))}
          </View>
          {categories.length > 6 ? (
            <Pressable style={styles.seeMoreBtn} onPress={() => setShowAllGenres((prev) => !prev)} accessibilityRole="button">
              <Text style={styles.seeMoreText}>{showAllGenres ? "Show less" : "Show all genres"}</Text>
              <MaterialCommunityIcons name={showAllGenres ? "chevron-up" : "chevron-down"} size={18} color={colors.textSecondary} />
            </Pressable>
          ) : null}

          <View style={[styles.sectionHeader, styles.collectionsHeader]}>
            <Text style={styles.sectionHeading}>Featured collections</Text>
          </View>
          <View style={styles.collectionsWrap}>
            {featuredCollections.map((category) => (
              <Pressable
                key={`collection-${category.id}`}
                style={styles.collectionRow}
                onPress={() => navigation.navigate("CategoryDetails", { categoryId: category.id, categoryName: category.name, categorySlug: category.slug })}
                accessibilityRole="button"
              >
                <View style={styles.collectionIcon}>
                  <MaterialCommunityIcons name="play-box-multiple-outline" size={18} color={colors.textSecondary} />
                </View>
                <Text style={styles.collectionText} numberOfLines={1}>{category.name}</Text>
                <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textSecondary} />
              </Pressable>
            ))}
          </View>
        </ScrollView>
      ) : null}

      {!showDiscovery && isLoading ? (
        <View style={styles.loadingGrid}>
          {Array.from({ length: 6 }).map((_, index) => (
            <View key={`search-skeleton-${index}`} style={styles.cardWrap}>
              <PosterCardSkeleton />
            </View>
          ))}
        </View>
      ) : null}

      {!showDiscovery && !isLoading ? (
        <FlatList
          data={filtered}
          keyExtractor={(item: ContentItem) => item.id}
          numColumns={2}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={5}
          removeClippedSubviews
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={<Text style={styles.resultsCount}>{filtered.length} {filtered.length === 1 ? "result" : "results"}</Text>}
          contentContainerStyle={styles.list}
          columnWrapperStyle={styles.row}
          renderItem={({ item }) => (
            <View style={styles.cardWrap}>
              <PosterCard item={item} onPress={() => navigation.navigate("ContentDetails", { contentId: item.id })} />
            </View>
          )}
          ListEmptyComponent={<View style={styles.empty}><MaterialCommunityIcons name="movie-search-outline" size={34} color={colors.textSecondary} /><Text style={styles.emptyTitle}>No titles found</Text><Text style={styles.emptyMessage}>Try another title or search term.</Text></View>}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  inputWrap: {
    marginTop: 10,
    marginBottom: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    minHeight: 50,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  input: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 15,
  },
  clearButton: { width: 32, height: 36, alignItems: "center", justifyContent: "center" },
  discovery: { paddingBottom: 28 },
  sectionHeader: { marginTop: 18, marginBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionHeading: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  sectionMeta: { color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
  genreGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 9,
  },
  genreItem: {
    width: "49%",
    minHeight: 52,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
  },
  genreIcon: { width: 30, height: 30, borderRadius: 5, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceMuted },
  genreText: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
  },
  seeMoreBtn: {
    alignSelf: "flex-start",
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 2,
  },
  seeMoreText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  collectionsHeader: { marginTop: 12 },
  collectionsWrap: { borderTopWidth: 1, borderTopColor: colors.border },
  collectionRow: {
    minHeight: 54,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 2,
  },
  collectionIcon: { width: 32, height: 32, borderRadius: 5, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceMuted },
  collectionText: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
  },
  list: { paddingTop: 8, paddingBottom: 24 },
  resultsCount: { color: colors.textSecondary, fontSize: 13, fontWeight: "600", marginBottom: 12 },
  row: { justifyContent: "space-between", marginBottom: 12 },
  loadingGrid: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
    paddingTop: 12,
  },
  cardWrap: { width: "48%", alignItems: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingBottom: 48 },
  emptyTitle: { marginTop: 12, color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  emptyMessage: { marginTop: 5, color: colors.textSecondary, fontSize: 13, textAlign: "center" },
});
