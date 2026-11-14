import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import { BackTitleHeader } from "@/components/common/BackTitleHeader";
import { PageTitleHeader } from "@/components/common/PageTitleHeader";
import { Screen } from "@/components/common/Screen";
import { PosterCard } from "@/components/content/PosterCard";
import { PosterCardSkeleton } from "@/components/content/PosterCardSkeleton";
import { RootStackParamList } from "@/navigation/types";
import { getWatchlist, removeFromWatchlist } from "@/services/watchlistService";
import { useAuthStore } from "@/store/authStore";
import { colors } from "@/theme/colors";

export function WatchlistScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const token = useAuthStore((s) => s.token);
  const showBackHeader = navigation.canGoBack();
  const queryClient = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ["watchlist"], queryFn: getWatchlist, enabled: Boolean(token), staleTime: 2 * 60 * 1000 });
  const uniqueData = useMemo(() => {
    const seen = new Set<string>();
    return data.filter((item) => {
      if (seen.has(item.video_id)) {
        return false;
      }
      seen.add(item.video_id);
      return true;
    });
  }, [data]);

  const removeMutation = useMutation({
    mutationFn: (videoId: string) => removeFromWatchlist(videoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] }).catch(() => undefined);
    },
  });

  return (
    <Screen scroll={false} contentStyle={styles.screen}>
      {showBackHeader ? (
        <BackTitleHeader
          title="Watchlist"
          onBack={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
              return;
            }
            navigation.navigate("Main", { screen: "Account" } as never);
          }}
        />
      ) : (
        <PageTitleHeader title="Watchlist" />
      )}

      {!token ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>Sign in to view your watchlist</Text>
          <Pressable style={styles.ctaBtn} onPress={() => navigation.navigate("Auth")}>
            <MaterialCommunityIcons name="login" size={22} color={colors.textPrimary} style={styles.ctaIcon} />
            <Text style={styles.ctaText}>Sign In</Text>
          </Pressable>
        </View>
      ) : isLoading ? (
        <View style={styles.grid}>
          {Array.from({ length: 6 }).map((_, index) => (
            <View key={`watchlist-skeleton-${index}`} style={styles.cardWrap}>
              <PosterCardSkeleton />
            </View>
          ))}
        </View>
      ) : uniqueData.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>No videos in watchlist</Text>
          <Pressable style={styles.ctaBtn} onPress={() => navigation.navigate("Main", { screen: "Search" } as never)}>
            <MaterialCommunityIcons name="playlist-plus" size={22} color={colors.textPrimary} style={styles.ctaIcon} />
            <Text style={styles.ctaText}>Find videos to add</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={uniqueData}
          keyExtractor={(item) => item.video_id}
          numColumns={2}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={5}
          removeClippedSubviews
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.cardWrap}>
              <PosterCard
                item={{ id: item.video_id, title: item.title || "Untitled" }}
                onPress={() => navigation.navigate("ContentDetails", { contentId: item.video_id })}
              />
              <Pressable
                accessibilityLabel={`Remove ${item.title || "title"} from watchlist`}
                style={styles.removeButton}
                onPress={() => removeMutation.mutate(item.video_id)}
                disabled={removeMutation.isPending}
              >
                <MaterialCommunityIcons name="heart-minus" size={18} color={colors.textPrimary} />
              </Pressable>
            </View>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  list: { paddingTop: 14, paddingBottom: 26 },
  row: { justifyContent: "space-between", marginBottom: 12 },
  cardWrap: { flex: 1, alignItems: "center" },
  removeButton: {
    position: "absolute",
    top: 8,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(5, 8, 12, 0.82)",
  },
  grid: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 110,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
  },
  ctaBtn: {
    marginTop: 14,
    minHeight: 54,
    borderRadius: 16,
    paddingHorizontal: 26,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  ctaIcon: {
    marginRight: 8,
  },
  ctaText: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
  },
});
