import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useQuery } from "@tanstack/react-query";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { BrandLogo } from "@/components/common/BrandLogo";
import { Screen } from "@/components/common/Screen";
import { HeroBanner } from "@/components/content/HeroBanner";
import { ContentRail } from "@/components/content/ContentRail";
import { HeroBannerSkeleton } from "@/components/content/HeroBannerSkeleton";
import { ContentRailSkeleton } from "@/components/content/ContentRailSkeleton";
import { useHomeRows } from "@/hooks/useHomeRows";
import { usePlayerStore } from "@/store/playerStore";
import { RootStackParamList } from "@/navigation/types";
import { fetchContentDetails, fetchFeaturedMovieRail, fetchFeaturedVideos, fetchHomeMovieRail, listLiveTvChannels, LiveTvChannelOut } from "@/services/contentService";
import { fetchSeries, fetchSeriesCategoryRows } from "@/services/seriesService";
import { colors } from "@/theme/colors";
import { ContentItem } from "@/types/models";
import { dedupeContentItems, prefetchContentImages } from "@/utils/contentList";

type HomeFilter = "movies" | "series" | "sports";

const FILTERS: { key: HomeFilter | "live_tv"; label: string }[] = [
  { key: "movies", label: "Movies" },
  { key: "series", label: "Series" },
  { key: "live_tv", label: "Watch TV" },
  { key: "sports", label: "Sports" },
];

function rowMatchesSports(rowName: string, contentType: string) {
  return contentType.toLowerCase().includes("sport") || rowName.toLowerCase().includes("sport");
}

function getLiveChannelImage(channel: LiveTvChannelOut) {
  return channel.thumbnails.square || channel.thumbnails.wide || channel.thumbnails.banner || channel.thumbnails.portrait;
}

export function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const isFocused = useIsFocused();
  const { width } = useWindowDimensions();
  const [activeFilter, setActiveFilter] = useState<HomeFilter | null>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const heroListRef = useRef<FlatList<ContentItem> | null>(null);
  const lastPlayedContentId = usePlayerStore((state) => state.lastPlayedContentId);
  const lastPositionSecondsByContentId = usePlayerStore((state) => state.lastPositionSecondsByContentId);
  const { data: homeRows = [], isLoading: homeLoading } = useHomeRows({ contentType: "video" });
  const { data: movieRows = [], isLoading: moviesLoading } = useHomeRows({
    contentType: "movie",
    enabled: activeFilter === "movies",
  });
  const { data: seriesCategoryRows = [], isLoading: seriesRowsLoading } = useQuery({
    queryKey: ["home-series-category-rows"],
    queryFn: fetchSeriesCategoryRows,
    enabled: activeFilter === "series",
  });
  const { data: seriesHighlights = [], isLoading: seriesHighlightsLoading } = useQuery({
    queryKey: ["home-series-highlights"],
    queryFn: () => fetchSeries("rating"),
    enabled: activeFilter === "series",
  });
  const { data: continueWatchingItem } = useQuery({
    queryKey: ["continue-watching-content", lastPlayedContentId],
    queryFn: () => fetchContentDetails(lastPlayedContentId as string),
    enabled: Boolean(lastPlayedContentId),
    staleTime: 60_000,
  });
  const { data: featuredVideos = [], isLoading: featuredLoading } = useQuery({
    queryKey: ["home-featured-videos"],
    queryFn: fetchFeaturedVideos,
    staleTime: 5 * 60 * 1000,
  });
  const { data: liveChannels = [], isLoading: liveChannelsLoading } = useQuery({
    queryKey: ["home-live-tv-channels"],
    queryFn: listLiveTvChannels,
    staleTime: 5 * 60 * 1000,
  });
  const { data: topTenMovies = [], isLoading: topTenLoading } = useQuery({
    queryKey: ["home-top-ten-movies"],
    queryFn: () => fetchHomeMovieRail("rating"),
    staleTime: 60_000,
  });
  const { data: newReleases = [], isLoading: newReleasesLoading } = useQuery({
    queryKey: ["home-new-releases"],
    queryFn: () => fetchHomeMovieRail("latest"),
    staleTime: 60_000,
  });
  const { data: featuredMovies = [], isLoading: featuredMoviesLoading } = useQuery({
    queryKey: ["home-featured-movies"],
    queryFn: fetchFeaturedMovieRail,
    staleTime: 60_000,
  });

  const visibleRows = useMemo(() => {
    if (activeFilter === "movies") return movieRows;
    if (activeFilter === "series") return seriesCategoryRows;
    if (activeFilter === "sports") return homeRows.filter((row) => rowMatchesSports(row.category_name, row.content_type));
    return homeRows;
  }, [activeFilter, homeRows, movieRows, seriesCategoryRows]);

  const isLoading = homeLoading
    || (activeFilter === null && featuredLoading)
    || (activeFilter === "movies" && moviesLoading)
    || (activeFilter === "series" && (seriesRowsLoading || seriesHighlightsLoading));

  const featuredItems = useMemo<ContentItem[]>(() => {
    const items = activeFilter === "series"
      ? seriesHighlights
      : activeFilter === null && featuredVideos.length
        ? featuredVideos
        : visibleRows.flatMap((row) => row.items);
    return dedupeContentItems(items).slice(0, 6);
  }, [activeFilter, featuredVideos, seriesHighlights, visibleRows]);

  useEffect(() => {
    prefetchContentImages(featuredItems, 8);
  }, [featuredItems]);

  useEffect(() => {
    setActiveSlide(0);
    heroListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [activeFilter, heroListRef]);

  const advanceHero = () => {
    if (featuredItems.length < 2) return;
    const nextIndex = (activeSlide + 1) % featuredItems.length;
    setActiveSlide(nextIndex);
    heroListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
  };

  return (
    <Screen>
      <View style={styles.headerRow}>
        <BrandLogo showTitle={false} size="small" />
        <Pressable style={styles.bellButton} onPress={() => Alert.alert("Notifications", "Notifications will be available soon.")} accessibilityRole="button" accessibilityLabel="Notifications">
          <MaterialCommunityIcons name="bell-outline" size={22} color={colors.textPrimary} />
        </Pressable>
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map((filter) => (
          <Pressable
            key={filter.key}
            style={[styles.filterButton, activeFilter === filter.key && styles.filterButtonActive]}
            onPress={() => {
              if (filter.key === "live_tv") {
                navigation.navigate("LiveTv");
                return;
              }
              const nextFilter = filter.key as HomeFilter;
              setActiveFilter((previous) => previous === nextFilter ? null : nextFilter);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeFilter === filter.key }}
          >
            <Text numberOfLines={1} style={[styles.filterLabel, activeFilter === filter.key && styles.filterLabelActive]}>{filter.label}</Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <>
          <HeroBannerSkeleton />
          <ContentRailSkeleton title="Live TV Channels" />
          <ContentRailSkeleton title="Top 10 Movies of the Month" />
          <ContentRailSkeleton title="New Releases" />
          <ContentRailSkeleton title="Featured Movies" />
        </>
      ) : null}

      {!isLoading && featuredItems.length ? (
        <>
          <FlatList
            ref={(ref) => {
              heroListRef.current = ref;
            }}
            data={featuredItems}
            horizontal
            pagingEnabled
            decelerationRate="fast"
            keyExtractor={(item) => `featured-${item.id}`}
            showsHorizontalScrollIndicator={false}
            getItemLayout={(_, index) => ({ length: width - 32, offset: (width - 32) * index, index })}
            onMomentumScrollEnd={(event) => {
              const offsetX = event.nativeEvent.contentOffset.x;
              const nextIndex = Math.round(offsetX / (width - 32));
              setActiveSlide(nextIndex);
            }}
            renderItem={({ item, index }) => (
              <View style={{ width: width - 32 }}>
                <HeroBanner
                  item={item}
                  isActive={isFocused && index === activeSlide}
                  onTrailerEnd={advanceHero}
                  onOpen={() => activeFilter === "series"
                    ? navigation.navigate("SeriesDetails", { seriesId: item.id })
                    : navigation.navigate("ContentDetails", { contentId: item.id })}
                />
              </View>
            )}
          />

          <View style={styles.dotsWrap}>
            {featuredItems.map((item, index) => (
              <View key={`dot-${item.id}`} style={[styles.dot, index === activeSlide && styles.dotActive]} />
            ))}
          </View>
        </>
      ) : null}

      {activeFilter === null && liveChannelsLoading ? <ContentRailSkeleton title="Live TV Channels" /> : null}
      {activeFilter === null && !liveChannelsLoading && liveChannels.some((channel) => channel.is_active !== false) ? (
        <View style={styles.liveChannelsSection}>
          <View style={styles.liveChannelsHeader}>
            <View style={styles.liveChannelsHeading}>
              <MaterialCommunityIcons name="radio" size={18} color={colors.primary} />
              <Text style={styles.sectionTitle}>Live TV Channels</Text>
            </View>
            <Pressable onPress={() => navigation.navigate("LiveTv")} accessibilityRole="button">
              <Text style={styles.viewAllLabel}>View All</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.liveChannelsList}>
            {liveChannels.filter((channel) => channel.is_active !== false).map((channel) => {
              const image = getLiveChannelImage(channel);
              return (
                <Pressable
                  key={channel.id}
                  style={styles.liveChannel}
                  onPress={() => navigation.navigate("LiveTvChannel", { channelId: channel.id })}
                  accessibilityRole="button"
                  accessibilityLabel={`Watch ${channel.title}`}
                >
                  {image ? (
                    <Image source={{ uri: image }} style={styles.liveChannelImage} resizeMode={channel.thumbnails.square ? "cover" : "contain"} />
                  ) : (
                    <Text style={styles.liveChannelFallback}>{channel.title.split(/\s+/).map((word) => word[0]).slice(0, 3).join("")}</Text>
                  )}
                  {channel.is_live ? <Text style={styles.liveBadge}>LIVE</Text> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {(activeFilter === null || activeFilter === "movies") && topTenLoading ? <ContentRailSkeleton title="Top 10 Movies of the Month" /> : null}
      {(activeFilter === null || activeFilter === "movies") && !topTenLoading && topTenMovies.length > 0 ? (
        <ContentRail
          title="Top 10 Movies of the Month"
          items={topTenMovies}
          ranked
          onOpen={(item) => navigation.navigate("ContentDetails", { contentId: item.id })}
        />
      ) : null}
      {activeFilter === null && continueWatchingItem && (lastPositionSecondsByContentId[continueWatchingItem.id] ?? 0) > 0 ? (
        <View style={styles.continueSection}>
          <Text style={styles.sectionTitle}>Continue Watching</Text>
          <Pressable
            style={styles.continueCard}
            onPress={() => navigation.navigate("ContentDetails", { contentId: continueWatchingItem.id })}
            accessibilityRole="button"
            accessibilityLabel={`Continue watching ${continueWatchingItem.title}`}
          >
            <Image
              source={{ uri: continueWatchingItem.thumbnails?.video_w_thumbnail || continueWatchingItem.thumbnails?.video_banner || undefined }}
              style={styles.continueImage}
              resizeMode="cover"
            />
            <View style={styles.continueOverlay}>
              <MaterialCommunityIcons name="play-circle" size={32} color={colors.textPrimary} />
              <Text numberOfLines={1} style={styles.continueTitle}>{continueWatchingItem.title}</Text>
            </View>
            {continueWatchingItem.duration ? (
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.min(100, (lastPositionSecondsByContentId[continueWatchingItem.id] / continueWatchingItem.duration) * 100)}%` }]} />
              </View>
            ) : null}
          </Pressable>
        </View>
      ) : null}
      {(activeFilter === null || activeFilter === "movies") && newReleasesLoading ? <ContentRailSkeleton title="New Releases" /> : null}
      {(activeFilter === null || activeFilter === "movies") && !newReleasesLoading && newReleases.length > 0 ? (
        <ContentRail
          title="New Releases"
          items={newReleases}
          onOpen={(item) => navigation.navigate("ContentDetails", { contentId: item.id })}
        />
      ) : null}

      {(activeFilter === null || activeFilter === "movies") && featuredMoviesLoading ? <ContentRailSkeleton title="Featured Movies" /> : null}
      {(activeFilter === null || activeFilter === "movies") && !featuredMoviesLoading && featuredMovies.length > 0 ? (
        <ContentRail
          title="Featured Movies"
          items={featuredMovies}
          variant="wider-landscape"
          previewOnFocus
          previewActive={isFocused}
          onOpen={(item) => navigation.navigate("ContentDetails", { contentId: item.id })}
        />
      ) : null}

      {activeFilter === "series" && !seriesHighlightsLoading && seriesHighlights.length > 0 ? (
        <ContentRail title="Top Rated Series" items={seriesHighlights} ranked onOpen={(item) => navigation.navigate("SeriesDetails", { seriesId: item.id })} />
      ) : null}
      {activeFilter === "series" && !seriesRowsLoading ? seriesCategoryRows.map((row) => (
        <ContentRail key={row.category_id} title={row.category_name} items={row.items} onOpen={(item) => navigation.navigate("SeriesDetails", { seriesId: item.id })} />
      )) : null}

      {!isLoading && visibleRows.map((row) => (
        <ContentRail
          key={row.category_id}
          title={row.category_name}
          items={row.items}
          onOpen={(item) => activeFilter === "series"
            ? navigation.navigate("SeriesDetails", { seriesId: item.id })
            : navigation.navigate("ContentDetails", { contentId: item.id })}
        />
      ))}

      {!isLoading && visibleRows.length === 0 && featuredItems.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>No content found</Text>
          <Text style={styles.emptyText}>Try another filter.</Text>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bellButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterRow: {
    marginTop: 14,
    flexDirection: "row",
    gap: 6,
  },
  filterButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  filterButtonActive: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}22`,
  },
  filterLabel: {
    color: colors.textSecondary,
    fontWeight: "700",
    fontSize: 12,
  },
  filterLabelActive: {
    color: colors.textPrimary,
  },
  dotsWrap: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.32)",
  },
  dotActive: {
    width: 18,
    borderRadius: 999,
    backgroundColor: "#ffffff",
  },
  emptyWrap: {
    marginTop: 26,
    paddingVertical: 20,
    alignItems: "center",
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  emptyText: {
    marginTop: 6,
    color: colors.textSecondary,
    fontSize: 13,
  },
  liveChannelsSection: {
    marginTop: 22,
  },
  continueSection: {
    marginTop: 22,
  },
  continueCard: {
    position: "relative",
    width: 240,
    aspectRatio: 16 / 9,
    marginTop: 12,
    overflow: "hidden",
    borderRadius: 6,
    backgroundColor: colors.surface,
  },
  continueImage: {
    width: "100%",
    height: "100%",
  },
  continueOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    padding: 12,
    backgroundColor: "rgba(5, 6, 9, 0.48)",
  },
  continueTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  progressTrack: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.primary,
  },
  liveChannelsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  liveChannelsHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 19,
    fontWeight: "800",
  },
  viewAllLabel: {
    color: colors.primaryStrong,
    fontSize: 13,
    fontWeight: "700",
  },
  liveChannelsList: {
    paddingRight: 16,
  },
  liveChannel: {
    width: 94,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
    overflow: "hidden",
    backgroundColor: colors.surface,
    borderRadius: 6,
  },
  liveChannelImage: {
    width: "100%",
    height: "100%",
    backgroundColor: colors.surfaceMuted,
  },
  liveChannelFallback: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: "600",
  },
  liveBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    overflow: "hidden",
    borderRadius: 2,
    backgroundColor: colors.primary,
    color: colors.textPrimary,
    paddingHorizontal: 5,
    paddingVertical: 2,
    fontSize: 9,
    fontWeight: "900",
  },
});
