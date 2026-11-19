import { ReactNode, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, Alert, ImageBackground, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import LinearGradient from "react-native-linear-gradient";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Screen } from "@/components/common/Screen";
import { SkeletonBlock } from "@/components/common/SkeletonBlock";
import { ContentRail } from "@/components/content/ContentRail";
import { OttVideoPlayer } from "@/components/content/OttVideoPlayer";
import { usePlayGate } from "@/hooks/usePlayGate";
import { RootStackParamList } from "@/navigation/types";
import { buildPlaybackSource } from "@/services/playbackService";
import { fetchContentDetails, fetchRelatedTitles } from "@/services/contentService";
import { addToWatchlist, getWatchlist, removeFromWatchlist } from "@/services/watchlistService";
import { usePlayerStore } from "@/store/playerStore";
import { useAuthStore } from "@/store/authStore";
import { colors } from "@/theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "ContentDetails">;

function sanitizeImageUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "null" || trimmed.toLowerCase() === "undefined") return undefined;
  return trimmed;
}

function formatDuration(seconds: number | null | undefined) {
  if (!seconds) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.max(1, Math.round((seconds % 3600) / 60));
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function DetailHero({ imageUri, children }: { imageUri?: string; children: ReactNode }) {
  const gradient = (
    <LinearGradient colors={["rgba(5,6,9,0.15)", "rgba(5,6,9,0.08)", "rgba(5,6,9,0.78)", colors.background]} locations={[0, 0.32, 0.72, 1]} style={styles.heroShade}>
      {children}
    </LinearGradient>
  );
  return imageUri ? (
    <ImageBackground source={{ uri: imageUri }} style={styles.hero} imageStyle={styles.heroImage} resizeMode="cover">
      {gradient}
    </ImageBackground>
  ) : (
    <View style={styles.hero}>{gradient}</View>
  );
}

export function ContentDetailsScreen({ route }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { contentId } = route.params;
  const [playRequested, setPlayRequested] = useState(false);
  const [playbackMode, setPlaybackMode] = useState<"title" | "trailer">("title");
  const [autoplayPending, setAutoplayPending] = useState(Boolean(route.params.autoplay));
  const [watchlisted, setWatchlisted] = useState(false);
  const autoplayStarted = useRef(false);
  const setLastPlayed = usePlayerStore((s) => s.setLastPlayed);
  const lastPositionSecondsByContentId = usePlayerStore((s) => s.lastPositionSecondsByContentId);
  const setLastPositionSeconds = usePlayerStore((s) => s.setLastPositionSeconds);
  const isCompleted = Boolean(usePlayerStore((s) => s.completedContentIds[contentId]));
  const setContentCompleted = usePlayerStore((s) => s.setContentCompleted);
  const token = useAuthStore((s) => s.token);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["content", contentId],
    queryFn: () => fetchContentDetails(contentId),
  });
  const watchlistQuery = useQuery({
    queryKey: ["watchlist"],
    queryFn: getWatchlist,
    enabled: Boolean(token),
    staleTime: 2 * 60 * 1000,
  });
  const category = data?.category || data?.categories?.[0] || null;
  const classification = data?.content_classification || null;
  const relatedFilter = category ? { category } : { contentClassification: classification };
  const relatedLabel = category ? `More in ${category}` : classification ? `More ${classification} Titles` : "Related Titles";
  const { data: relatedTitles = [] } = useQuery({
    queryKey: ["related-titles", contentId, category, classification],
    queryFn: () => fetchRelatedTitles({ ...relatedFilter, excludeId: contentId }),
    enabled: Boolean(category || classification),
    staleTime: 2 * 60 * 1000,
  });
  useEffect(() => {
    setWatchlisted(Boolean(watchlistQuery.data?.some((item) => item.video_id === contentId)));
  }, [contentId, watchlistQuery.data]);

  const playbackSource = data ? buildPlaybackSource(data) : null;

  const { handlePlay, isCheckingAccess } = usePlayGate({
    contentId,
    accessType: (data?.access_type as "free" | "subscription" | "pay_per_view" | "rental") || "subscription",
    onAllowedPlay: () => {
      setLastPlayed(contentId);
      setPlaybackMode("title");
      setPlayRequested(true);
      setAutoplayPending(false);
    },
  });

  useEffect(() => {
    if (!route.params.autoplay || !data || isCheckingAccess || autoplayStarted.current) return;
    autoplayStarted.current = true;
    handlePlay();
  }, [data, handlePlay, isCheckingAccess, route.params.autoplay]);

  const handleWatchlistToggle = async () => {
    if (!token) {
      navigation.navigate("Auth");
      return;
    }

    try {
      if (watchlisted) {
        await removeFromWatchlist(contentId);
        setWatchlisted(false);
      } else {
        await addToWatchlist(contentId);
        setWatchlisted(true);
      }
    } catch {
      Alert.alert("Watchlist error", "Could not update watchlist for this title.");
    }
  };

  const handleShare = async () => {
    if (!data) return;
    try {
      await Share.share({
        title: data.title,
        message: `Watch ${data.title} on KalingoTV.`,
      });
    } catch {
      Alert.alert("Share failed", "Could not open the share sheet for this title.");
    }
  };

  const backdrop = sanitizeImageUrl(data?.thumbnails?.video_banner)
    || sanitizeImageUrl(data?.thumbnails?.video_w_thumbnail)
    || sanitizeImageUrl(data?.thumbnails?.video_h_thumbnail);
  const duration = formatDuration(data?.duration);
  const summary = data?.long_description || data?.description || data?.short_description;
  const savedPosition = lastPositionSecondsByContentId[contentId] ?? 0;
  const canResume = isCompleted || savedPosition >= 5;
  const watchProgress = isCompleted ? 1 : data?.duration ? Math.min(savedPosition / data.duration, 0.99) : 0;
  const remainingSeconds = isCompleted ? 0 : Math.max(0, (data?.duration ?? 0) - savedPosition);
  const remainingLabel = remainingSeconds >= 3600
    ? `${Math.floor(remainingSeconds / 3600)}h ${Math.max(1, Math.ceil((remainingSeconds % 3600) / 60))}m left`
    : `${Math.max(1, Math.ceil(remainingSeconds / 60))}m left`;
  const isAutoplayStarting = autoplayPending && !playRequested;
  const trailer = sanitizeImageUrl(data?.trailer_hls_url) || sanitizeImageUrl(data?.trailer_display_url);
  const activePlaybackSource = playbackMode === "trailer" && trailer
    ? { uri: trailer, protocol: trailer.toLowerCase().includes(".m3u8") ? "hls" as const : "mp4" as const, drmEnabled: false }
    : playbackSource;

  if (!data) {
    return (
      <Screen contentStyle={styles.screenContent}>
        <View style={styles.hero}>
          <View style={styles.heroShade}>
            <View style={styles.heroTopBar}>
              <Pressable onPress={() => navigation.goBack()} style={styles.heroIconButton} accessibilityRole="button" accessibilityLabel="Back">
                <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
              </Pressable>
            </View>
            {isLoading ? (
              <View style={styles.heroCopy} accessibilityRole="progressbar" accessibilityLabel="Loading video details">
                <SkeletonBlock style={styles.skeletonEyebrow} />
                <SkeletonBlock style={styles.skeletonTitle} />
                <SkeletonBlock style={styles.skeletonMeta} />
                <SkeletonBlock style={styles.skeletonDescription} />
                <SkeletonBlock style={styles.skeletonButton} />
                <SkeletonBlock style={styles.skeletonActions} />
              </View>
            ) : (
              <View style={styles.heroCopy}>
                <Text style={styles.title}>{isError ? "Couldn't load this title" : "Title unavailable"}</Text>
                <Pressable onPress={() => { void refetch(); }} style={styles.retryButton} accessibilityRole="button">
                  <Text style={styles.secondaryActionText}>Try Again</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen contentStyle={styles.screenContent}>
      {playRequested && activePlaybackSource ? (
        <View style={styles.playerSection}>
          <View style={styles.playerHeader}>
            <Pressable onPress={() => navigation.goBack()} style={styles.headerIcon} accessibilityRole="button" accessibilityLabel="Back">
              <MaterialCommunityIcons name="arrow-left" size={23} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.playerTitle} numberOfLines={1}>{playbackMode === "trailer" ? `${data?.title} · Trailer` : data?.title}</Text>
            <Pressable onPress={() => {
              setPlayRequested(false);
              setAutoplayPending(false);
            }} style={styles.headerIcon} accessibilityRole="button" accessibilityLabel="Close player">
              <MaterialCommunityIcons name="close" size={23} color={colors.textPrimary} />
            </Pressable>
          </View>
          <OttVideoPlayer
            contentId={playbackMode === "trailer" ? `${contentId}-trailer` : contentId}
            source={activePlaybackSource}
            startPositionSeconds={playbackMode === "trailer" ? 0 : savedPosition}
            onPlaybackEnd={() => {
              if (playbackMode === "title") setContentCompleted(contentId, true);
              setPlayRequested(false);
              setAutoplayPending(false);
            }}
          />
        </View>
      ) : (
        <DetailHero imageUri={backdrop}>
            <View style={styles.heroTopBar}>
              <Pressable onPress={() => navigation.goBack()} style={styles.heroIconButton} accessibilityRole="button" accessibilityLabel="Back">
                <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
              </Pressable>
            </View>
            <View style={styles.heroCopy}>
              {data?.content_type ? <Text style={styles.eyebrow}>{data.content_type.replaceAll("_", " ")}</Text> : null}
              <Text style={styles.title}>{data.title}</Text>
              <View style={styles.metaRow}>
                {data?.rating != null ? <Text style={styles.rating}><MaterialCommunityIcons name="star" size={15} color="#ffc857" /> {data.rating.toFixed(1)}</Text> : null}
                {data?.created_at ? <Text style={styles.metaText}>{new Date(data.created_at).getFullYear()}</Text> : null}
                {duration ? <Text style={styles.metaText}>{duration}</Text> : null}
                {data?.access_type ? <Text style={styles.accessBadge}>{data.access_type.replaceAll("_", " ")}</Text> : null}
              </View>
              {summary ? <Text style={styles.heroDescription} numberOfLines={3}>{summary}</Text> : null}
              <View style={styles.actionRow}>
                {isAutoplayStarting ? (
                  <LinearGradient colors={[colors.primaryStrong, colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.playButton}>
                    <ActivityIndicator color={colors.background} size="small" />
                    <Text style={styles.playButtonText}>Starting...</Text>
                  </LinearGradient>
                ) : (
                  <Pressable onPress={handlePlay} disabled={isCheckingAccess || !data} style={[styles.primaryAction, (isCheckingAccess || !data) && styles.disabled]} accessibilityRole="button">
                    <LinearGradient colors={[colors.primaryStrong, colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.playButton}>
                      {isCheckingAccess ? <ActivityIndicator color={colors.background} size="small" /> : <MaterialCommunityIcons name="play" size={29} color={colors.background} />}
                      <Text style={styles.playButtonText}>{isCheckingAccess ? "Checking..." : canResume ? "Resume" : "Play"}</Text>
                    </LinearGradient>
                  </Pressable>
                )}
              </View>
              {canResume ? (
                <View style={styles.progressSection}>
                  <View style={styles.progressTrack}>
                    <LinearGradient
                      colors={[colors.primaryStrong, colors.primary]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[styles.progressFill, { width: `${watchProgress * 100}%` }]}
                    />
                  </View>
                  <Text style={styles.progressLabel}>{isCompleted ? "100% completed" : `${Math.round(watchProgress * 100)}% watched · ${remainingLabel}`}</Text>
                </View>
              ) : null}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.secondaryActions} style={styles.secondaryActionsViewport}>
                {isCompleted ? (
                  <Pressable
                    onPress={() => {
                      setLastPositionSeconds(contentId, 0);
                      setContentCompleted(contentId, false);
                      handlePlay();
                    }}
                    style={styles.secondaryAction}
                    accessibilityRole="button"
                  >
                    <MaterialCommunityIcons name="restart" size={20} color={colors.textPrimary} />
                    <Text style={styles.secondaryActionText}>Start Over</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => {
                    if (!trailer) return;
                    setPlaybackMode("trailer");
                    setPlayRequested(true);
                  }}
                  disabled={!trailer}
                  style={[styles.secondaryAction, !trailer && styles.disabled]}
                  accessibilityRole="button"
                >
                  <MaterialCommunityIcons name="movie-play-outline" size={20} color={colors.textPrimary} />
                  <Text style={styles.secondaryActionText}>Trailer</Text>
                </Pressable>
                <Pressable onPress={handleWatchlistToggle} style={styles.secondaryAction} accessibilityRole="button" accessibilityLabel={watchlisted ? "Remove from My List" : "Add to My List"}>
                  <MaterialCommunityIcons name={watchlisted ? "check" : "plus"} size={21} color={colors.textPrimary} />
                  <Text style={styles.secondaryActionText}>{watchlisted ? "In My List" : "My List"}</Text>
                </Pressable>
                <Pressable onPress={handleShare} style={styles.secondaryAction} accessibilityRole="button" accessibilityLabel="Share title">
                  <MaterialCommunityIcons name="share-variant-outline" size={20} color={colors.textPrimary} />
                  <Text style={styles.secondaryActionText}>Share</Text>
                </Pressable>
              </ScrollView>
            </View>
        </DetailHero>
      )}

      <View style={styles.detailsBody}>
        {playRequested && !activePlaybackSource ? <Text style={styles.errorText}>No playable stream URL was found for this title.</Text> : null}
        {summary ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Overview</Text>
            <Text style={styles.description}>{summary}</Text>
          </View>
        ) : null}
        <View style={styles.factsRow}>
          <View style={styles.fact}><Text style={styles.factLabel}>Rating</Text><Text style={styles.factValue}>{data?.rating != null ? `${data.rating.toFixed(1)} / 10` : "Not rated"}</Text></View>
          <View style={styles.fact}><Text style={styles.factLabel}>Length</Text><Text style={styles.factValue}>{duration || "Not specified"}</Text></View>
          <View style={styles.fact}><Text style={styles.factLabel}>Access</Text><Text style={styles.factValue}>{data?.access_type?.replaceAll("_", " ") || "Standard"}</Text></View>
        </View>
        {relatedTitles.length ? (
          <ContentRail
            title={relatedLabel}
            items={relatedTitles}
            variant="landscape"
            onOpen={(item) => navigation.navigate("ContentDetails", { contentId: item.id })}
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContent: { paddingHorizontal: 0 },
  hero: { minHeight: 520, backgroundColor: colors.surface },
  heroImage: { opacity: 0.88 },
  heroShade: { flex: 1, paddingHorizontal: 20, paddingBottom: 26, justifyContent: "space-between" },
  heroTopBar: { paddingTop: 8, alignItems: "flex-start" },
  heroIconButton: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(5,6,9,0.62)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  heroCopy: { gap: 11 },
  skeletonEyebrow: { width: 90, height: 12, borderRadius: 4 },
  skeletonTitle: { width: "75%", height: 38, borderRadius: 4 },
  skeletonMeta: { width: "55%", height: 16, borderRadius: 4 },
  skeletonDescription: { width: "90%", height: 40, borderRadius: 4 },
  skeletonButton: { width: "100%", height: 56, borderRadius: 8 },
  skeletonActions: { width: "70%", height: 44, borderRadius: 8 },
  retryButton: { alignSelf: "flex-start", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  eyebrow: { color: colors.primary, fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1.1 },
  title: { color: "#fff", fontSize: 34, fontWeight: "900", lineHeight: 38 },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 12 },
  rating: { color: "#fff", fontSize: 14, fontWeight: "800" },
  metaText: { color: "#d8dbe2", fontSize: 13, fontWeight: "600" },
  accessBadge: { color: colors.textPrimary, fontSize: 10, fontWeight: "800", textTransform: "uppercase", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)", backgroundColor: "rgba(5,6,9,0.35)" },
  heroDescription: { color: "rgba(255,255,255,0.82)", fontSize: 14, lineHeight: 20 },
  actionRow: { width: "100%", marginTop: 3 },
  primaryAction: { width: "100%", borderRadius: 8, overflow: "hidden" },
  playButton: { width: "100%", minHeight: 56, paddingHorizontal: 20, borderRadius: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  playButtonText: { color: "#11131a", fontSize: 18, fontWeight: "900", textShadowColor: "rgba(0,0,0,0.12)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1 },
  progressSection: { gap: 6, marginTop: -3 },
  progressTrack: { height: 5, borderRadius: 3, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.2)" },
  progressFill: { height: "100%", borderRadius: 3 },
  progressLabel: { color: "rgba(255,255,255,0.72)", fontSize: 11, fontWeight: "700", textAlign: "right" },
  disabled: { opacity: 0.55 },
  secondaryActionsViewport: { marginHorizontal: -20, marginTop: 1 },
  secondaryActions: { flexDirection: "row", gap: 8, paddingHorizontal: 20, paddingRight: 40 },
  secondaryAction: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.24)", backgroundColor: "rgba(5,6,9,0.48)" },
  secondaryActionText: { color: colors.textPrimary, fontSize: 12, fontWeight: "700" },
  playerSection: { backgroundColor: "#000", paddingHorizontal: 12, paddingBottom: 12 },
  playerHeader: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 10 },
  headerIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  playerTitle: { flex: 1, color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
  detailsBody: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 32, gap: 24 },
  section: { gap: 9 },
  sectionTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: "800" },
  description: { color: "#b8bdc8", fontSize: 14, lineHeight: 22 },
  factsRow: { flexDirection: "row", paddingVertical: 16, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  fact: { flex: 1, gap: 5, paddingRight: 10 },
  factLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  factValue: { color: colors.textPrimary, fontSize: 13, fontWeight: "700", textTransform: "capitalize" },
  errorText: { color: colors.danger, lineHeight: 20 },
});
