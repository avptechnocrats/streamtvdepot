import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
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

  const featuredCollections = useMemo(() => categories.slice(0, 5), [categories]);

  useEffect(() => {
    if (!showDiscovery) {
      prefetchContentImages(filtered, 18);
    }
  }, [filtered, showDiscovery]);

  return (
    <Screen contentStyle={styles.wrap}>
      <PageTitleHeader title="Search" />
      <View style={styles.inputWrap}>
        <MaterialCommunityIcons name="magnify" size={24} color={colors.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by actor, title..."
          placeholderTextColor={colors.textSecondary}
          style={styles.input}
        />
        <MaterialCommunityIcons name="microphone-outline" size={22} color={colors.textSecondary} />
      </View>

      {showDiscovery ? (
        <>
          <Text style={styles.sectionHeading}>Genres</Text>
          <View style={styles.genreGrid}>
            {visibleGenres.map((category) => (
              <Pressable
                key={category.id}
                style={styles.genrePill}
                onPress={() => navigation.navigate("CategoryDetails", { categoryId: category.id, categoryName: category.name, categorySlug: category.slug })}
              >
                <Text style={styles.genreText}>{category.name}</Text>
              </Pressable>
            ))}
          </View>
          {categories.length > 6 ? (
            <Pressable style={styles.seeMoreBtn} onPress={() => setShowAllGenres((prev) => !prev)}>
              <Text style={styles.seeMoreText}>{showAllGenres ? "See less" : "See more"}</Text>
            </Pressable>
          ) : null}

          <Text style={styles.sectionHeading}>Featured collections</Text>
          <View style={styles.collectionsWrap}>
            {featuredCollections.map((category) => (
              <Pressable
                key={`collection-${category.id}`}
                style={styles.collectionRow}
                onPress={() => navigation.navigate("CategoryDetails", { categoryId: category.id, categoryName: category.name, categorySlug: category.slug })}
              >
                <Text style={styles.collectionText}>{category.name}</Text>
                <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textSecondary} />
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {!showDiscovery && isLoading ? (
        <View style={styles.grid}>
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
          contentContainerStyle={styles.list}
          columnWrapperStyle={styles.row}
          renderItem={({ item }) => (
            <View style={styles.cardWrap}>
              <PosterCard item={item} onPress={() => navigation.navigate("ContentDetails", { contentId: item.id })} />
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No results found.</Text>}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: {},
  inputWrap: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 54,
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
  sectionHeading: {
    marginTop: 22,
    marginBottom: 10,
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "800",
  },
  genreGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 8,
  },
  genrePill: {
    width: "48.5%",
    minHeight: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  genreText: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: "500",
    textAlign: "center",
  },
  seeMoreBtn: {
    marginTop: 12,
    alignSelf: "center",
    minHeight: 44,
    borderRadius: 999,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  seeMoreText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  collectionsWrap: {
    marginTop: 2,
  },
  collectionRow: {
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  collectionText: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "500",
  },
  list: { paddingTop: 14, paddingBottom: 20 },
  row: { justifyContent: "space-between", marginBottom: 12 },
  grid: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
  },
  cardWrap: { width: "48%", alignItems: "center" },
  empty: { color: colors.textSecondary, marginTop: 20 },
});
