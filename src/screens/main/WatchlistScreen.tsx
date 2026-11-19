import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, FlatList, Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import { BackTitleHeader } from "@/components/common/BackTitleHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { PageTitleHeader } from "@/components/common/PageTitleHeader";
import { Screen } from "@/components/common/Screen";
import { SkeletonBlock } from "@/components/common/SkeletonBlock";
import { RootStackParamList } from "@/navigation/types";
import { getWatchlist, removeFromWatchlist } from "@/services/watchlistService";
import { useAuthStore } from "@/store/authStore";
import { colors } from "@/theme/colors";
import { WatchlistItem } from "@/types/models";

function WatchlistCard({ item, width, onOpen, onRemove, removing }: { item: WatchlistItem; width: number; onOpen: () => void; onRemove: () => void; removing: boolean }) {
  const image = typeof item.thumbnail_url === "string" && item.thumbnail_url.trim() && !/^(null|undefined)$/i.test(item.thumbnail_url.trim())
    ? item.thumbnail_url.trim() : undefined;
  const [imageLoaded, setImageLoaded] = useState(!image);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageLoaded(!image);
    setImageFailed(false);
  }, [image]);

  const typeLabel = item.content_type === "series" ? "Series" : item.content_type === "live_stream" ? "Live TV" : "Video";

  return (
    <View style={[styles.cardWrap, { width }]}>
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Open ${item.title || "title"}`}>
        <View style={styles.poster}>
          {image && !imageFailed ? (
            <Image source={{ uri: image }} style={styles.posterImage} resizeMode="cover" onLoadEnd={() => setImageLoaded(true)} onError={() => { setImageFailed(true); setImageLoaded(true); }} />
          ) : <MaterialCommunityIcons name="movie-open-outline" size={32} color={colors.textSecondary} />}
          {!imageLoaded ? <SkeletonBlock style={StyleSheet.absoluteFill} /> : null}
        </View>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.title || "Untitled"}</Text>
        <Text style={styles.cardType}>{typeLabel}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remove ${item.title || "title"} from watchlist`}
        accessibilityState={{ disabled: removing }}
        style={styles.removeButton}
        onPress={onRemove}
        disabled={removing}
        hitSlop={6}
      >
        <MaterialCommunityIcons name="close" size={20} color={colors.textPrimary} />
      </Pressable>
    </View>
  );
}

export function WatchlistScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { width } = useWindowDimensions();
  const token = useAuthStore((s) => s.token);
  const userId = useAuthStore((s) => s.user?.id);
  const cardWidth = Math.max(0, (width - 44) / 2);
  const showBackHeader = navigation.canGoBack();
  const queryClient = useQueryClient();
  const { data = [], isLoading, isError, refetch } = useQuery({ queryKey: ["watchlist", userId ?? null], queryFn: getWatchlist, enabled: Boolean(token), staleTime: 2 * 60 * 1000 });
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
    onError: () => Alert.alert("Unable to remove title", "Please try again."),
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
        <EmptyState icon="heart-outline" title="Sign in to view your watchlist" actionLabel="Sign In" actionIcon="login" onAction={() => navigation.navigate("Auth")} />
      ) : isLoading ? (
        <View style={styles.grid}>
          {Array.from({ length: 6 }).map((_, index) => (
            <View key={`watchlist-skeleton-${index}`} style={{ width: cardWidth }}>
              <SkeletonBlock style={styles.skeletonPoster} />
              <SkeletonBlock style={styles.skeletonTitle} />
              <SkeletonBlock style={styles.skeletonType} />
            </View>
          ))}
        </View>
      ) : isError ? (
        <EmptyState icon="alert-circle-outline" title="Unable to load your watchlist" actionLabel="Try Again" actionIcon="refresh" onAction={() => { void refetch(); }} />
      ) : uniqueData.length === 0 ? (
        <EmptyState icon="heart-outline" title="Your watchlist is empty" actionLabel="Browse titles" actionIcon="magnify" onAction={() => navigation.navigate("Main", { screen: "Search" } as never)} />
      ) : (
        <>
        <Text style={styles.itemCount}>{uniqueData.length} {uniqueData.length === 1 ? "title" : "titles"}</Text>
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
            <WatchlistCard
              item={item}
              width={cardWidth}
              onOpen={() => {
                if (item.content_type === "series") navigation.navigate("SeriesDetails", { seriesId: item.video_id });
                else if (item.content_type === "live_stream") navigation.navigate("LiveTvChannel", { channelId: item.video_id });
                else navigation.navigate("ContentDetails", { contentId: item.video_id });
              }}
              onRemove={() => removeMutation.mutate(item.video_id)}
              removing={removeMutation.isPending}
            />
          )}
        />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  itemCount: { marginTop: 12, color: colors.textSecondary, fontSize: 13, fontWeight: "600" },
  list: { paddingTop: 14, paddingBottom: 26 },
  row: { gap: 12, marginBottom: 20 },
  cardWrap: { minWidth: 0 },
  poster: { width: "100%", aspectRatio: 2 / 3, borderRadius: 6, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceMuted },
  skeletonPoster: { width: "100%", aspectRatio: 2 / 3, borderRadius: 6 },
  skeletonTitle: { width: "75%", height: 14, marginTop: 8, borderRadius: 3 },
  skeletonType: { width: "38%", height: 12, marginTop: 6, borderRadius: 3 },
  posterImage: { width: "100%", height: "100%" },
  cardTitle: { marginTop: 8, color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  cardType: { marginTop: 3, color: colors.textSecondary, fontSize: 12 },
  removeButton: {
    position: "absolute",
    top: 8,
    right: 8,
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
});
