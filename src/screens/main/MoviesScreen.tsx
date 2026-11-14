import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Screen } from "@/components/common/Screen";
import { PosterCard } from "@/components/content/PosterCard";
import { PosterCardSkeleton } from "@/components/content/PosterCardSkeleton";
import { fetchMovies } from "@/services/contentService";
import { RootStackParamList } from "@/navigation/types";
import { colors } from "@/theme/colors";
import { dedupeContentItems, prefetchContentImages } from "@/utils/contentList";

export function MoviesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { data = [], isLoading } = useQuery({ queryKey: ["movies"], queryFn: fetchMovies, staleTime: 5 * 60 * 1000 });
  const uniqueData = useMemo(() => dedupeContentItems(data), [data]);

  useEffect(() => {
    prefetchContentImages(uniqueData, 18);
  }, [uniqueData]);

  return (
    <Screen scroll={false} contentStyle={styles.wrap}>
      <Text style={styles.title}>Movies</Text>
      {isLoading ? (
        <View style={styles.grid}>
          {Array.from({ length: 6 }).map((_, index) => (
            <View key={`movie-skeleton-${index}`} style={styles.cardWrap}>
              <PosterCardSkeleton />
            </View>
          ))}
        </View>
      ) : null}
      <FlatList
        style={isLoading ? styles.hiddenList : undefined}
        data={uniqueData}
        keyExtractor={(item) => item.id}
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
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 16 },
  title: { color: colors.textPrimary, fontSize: 28, fontWeight: "800" },
  list: { paddingTop: 14, paddingBottom: 20 },
  row: { justifyContent: "space-between", marginBottom: 12 },
  cardWrap: { flex: 1, alignItems: "center" },
  hiddenList: { display: "none" },
  grid: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
  },
});
