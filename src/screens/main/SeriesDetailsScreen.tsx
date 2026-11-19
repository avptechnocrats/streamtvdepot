import { ReactNode, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, Image, ImageBackground, Pressable, StyleSheet, Text, View } from "react-native";
import LinearGradient from "react-native-linear-gradient";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import { BackTitleHeader } from "@/components/common/BackTitleHeader";
import { Screen } from "@/components/common/Screen";
import { OttVideoPlayer } from "@/components/content/OttVideoPlayer";
import { usePlayGate } from "@/hooks/usePlayGate";
import { RootStackParamList } from "@/navigation/types";
import { authorizeSeriesEpisode, fetchSeriesDetails, fetchSeriesEpisodes, SeriesEpisode } from "@/services/seriesService";
import { PlaybackSource } from "@/services/playbackService";
import { colors } from "@/theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "SeriesDetails">;

function sanitizeImageUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "null" || trimmed.toLowerCase() === "undefined") return undefined;
  return trimmed;
}

function formatEpisodeDuration(seconds: number | null) {
  if (!seconds) return "";
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}

function SeriesHero({ imageUri, children }: { imageUri?: string; children: ReactNode }) {
  const gradient = (
    <LinearGradient colors={["rgba(5,6,9,0.16)", "rgba(5,6,9,0.08)", "rgba(5,6,9,0.8)", colors.background]} locations={[0, 0.3, 0.72, 1]} style={styles.heroShade}>
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

export function SeriesDetailsScreen({ route, navigation }: Props) {
  const { seriesId } = route.params;
  const [playback, setPlayback] = useState<{ episode: SeriesEpisode; source: PlaybackSource } | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const requestedEpisode = useRef<SeriesEpisode | null>(null);
  const autoplayStarted = useRef(false);
  const { data: series, isLoading: seriesLoading } = useQuery({
    queryKey: ["series-detail", seriesId],
    queryFn: () => fetchSeriesDetails(seriesId),
  });
  const { data: episodes = [], isLoading: episodesLoading } = useQuery({
    queryKey: ["series-episodes", seriesId],
    queryFn: () => fetchSeriesEpisodes(seriesId),
    enabled: Boolean(series),
  });
  const accessType = series?.access_type === "ppv" ? "pay_per_view" : series?.access_type ?? "free";
  const seasons = Array.from(new Set(episodes.map((episode) => episode.season_number))).sort((a, b) => a - b);
  const visibleEpisodes = selectedSeason == null
    ? episodes
    : episodes.filter((episode) => episode.season_number === selectedSeason);

  useEffect(() => {
    if (selectedSeason == null && seasons.length) setSelectedSeason(seasons[0]);
  }, [seasons, selectedSeason]);

  const { handlePlay, isCheckingAccess } = usePlayGate({
    contentId: seriesId,
    accessType,
    onAllowedPlay: () => {
      const episode = requestedEpisode.current;
      if (!episode) return;
      setPlaybackError(null);
      setIsAuthorizing(true);
      authorizeSeriesEpisode(seriesId, episode.id)
        .then((uri) => {
          const lowerUri = uri.toLowerCase();
          const protocol = lowerUri.includes(".m3u8") ? "hls" : lowerUri.includes(".mpd") ? "dash" : lowerUri.includes(".mp4") ? "mp4" : "unknown";
          setPlayback({ episode, source: { uri, protocol, drmEnabled: false } });
        })
        .catch(() => setPlaybackError("This episode could not be started. Please try again."))
        .finally(() => setIsAuthorizing(false));
    },
  });

  useEffect(() => {
    if (!route.params.autoplay || !series || isCheckingAccess || autoplayStarted.current) return;
    const episode = episodes.find((candidate) => candidate.has_media);
    if (!episode) return;
    autoplayStarted.current = true;
    requestedEpisode.current = episode;
    handlePlay();
  }, [episodes, handlePlay, isCheckingAccess, route.params.autoplay, series]);

  if (seriesLoading || !series) {
    return (
      <Screen>
        <BackTitleHeader title="Series" onBack={() => navigation.goBack()} />
        <ActivityIndicator color={colors.primary} />
      </Screen>
    );
  }

  const image = sanitizeImageUrl(series.thumbnails?.video_banner)
    || sanitizeImageUrl(series.thumbnails?.video_w_thumbnail)
    || sanitizeImageUrl(series.thumbnail_url);
  const firstEpisode = episodes.find((episode) => episode.has_media);
  const isAutoplayStarting = Boolean(route.params.autoplay && !playback);

  const startEpisode = (episode: SeriesEpisode) => {
    requestedEpisode.current = episode;
    handlePlay();
  };

  return (
    <Screen contentStyle={styles.screenContent}>
      {playback ? (
        <View style={styles.playerSection}>
          <View style={styles.playerHeader}>
            <Pressable onPress={() => navigation.goBack()} style={styles.headerIcon} accessibilityRole="button" accessibilityLabel="Back">
              <MaterialCommunityIcons name="arrow-left" size={23} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.playerTitle} numberOfLines={1}>{playback.episode.title}</Text>
            <Pressable onPress={() => setPlayback(null)} style={styles.headerIcon} accessibilityRole="button" accessibilityLabel="Close player">
              <MaterialCommunityIcons name="close" size={23} color={colors.textPrimary} />
            </Pressable>
          </View>
          <OttVideoPlayer contentId={playback.episode.id} source={playback.source} />
        </View>
      ) : (
        <SeriesHero imageUri={image}>
            <View style={styles.heroTopBar}>
              <Pressable onPress={() => navigation.goBack()} style={styles.heroIconButton} accessibilityRole="button" accessibilityLabel="Back">
                <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
              </Pressable>
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.eyebrow}>Original series</Text>
              <Text style={styles.title}>{series.title}</Text>
              <View style={styles.metaRow}>
                {series.rating != null ? <Text style={styles.rating}><MaterialCommunityIcons name="star" size={15} color="#ffc857" /> {series.rating.toFixed(1)}</Text> : null}
                <Text style={styles.metaText}>{series.total_seasons} {series.total_seasons === 1 ? "Season" : "Seasons"}</Text>
                <Text style={styles.accessBadge}>{series.access_type.replaceAll("_", " ")}</Text>
              </View>
              {series.description ? <Text style={styles.heroDescription} numberOfLines={4}>{series.description}</Text> : null}
              {isAutoplayStarting ? (
                <LinearGradient colors={[colors.primaryStrong, colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.playButton}>
                  <ActivityIndicator color={colors.background} size="small" />
                  <Text style={styles.playButtonText}>Starting...</Text>
                </LinearGradient>
              ) : (
                <Pressable
                  onPress={() => firstEpisode && startEpisode(firstEpisode)}
                  disabled={!firstEpisode || isCheckingAccess || isAuthorizing}
                  style={(!firstEpisode || isCheckingAccess || isAuthorizing) ? styles.disabled : undefined}
                  accessibilityRole="button"
                  accessibilityLabel={`Play ${series.title}`}
                >
                  <LinearGradient colors={[colors.primaryStrong, colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.playButton}>
                    {isCheckingAccess || isAuthorizing ? <ActivityIndicator color={colors.background} size="small" /> : <MaterialCommunityIcons name="play" size={22} color={colors.background} />}
                    <Text style={styles.playButtonText}>{isAuthorizing ? "Starting..." : isCheckingAccess ? "Checking..." : "Play First Episode"}</Text>
                  </LinearGradient>
                </Pressable>
              )}
            </View>
        </SeriesHero>
      )}

      <View style={styles.body}>
        {playbackError ? <Text style={styles.error}>{playbackError}</Text> : null}
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>Browse by season</Text>
            <Text style={styles.sectionTitle}>Episodes</Text>
          </View>
          {selectedSeason != null ? <Text style={styles.episodeCount}>{visibleEpisodes.length} {visibleEpisodes.length === 1 ? "episode" : "episodes"}</Text> : null}
        </View>
        {seasons.length > 1 ? (
          <View style={styles.seasonTabs}>
            {seasons.map((season) => (
              <Pressable key={season} onPress={() => setSelectedSeason(season)} style={[styles.seasonTab, selectedSeason === season && styles.seasonTabActive]} accessibilityRole="tab" accessibilityState={{ selected: selectedSeason === season }}>
                <Text style={[styles.seasonTabText, selectedSeason === season && styles.seasonTabTextActive]}>Season {season}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {episodesLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
        {!episodesLoading && !episodes.length ? <Text style={styles.empty}>Episodes are coming soon.</Text> : null}
        {visibleEpisodes.map((episode) => {
          const thumbnail = sanitizeImageUrl(episode.thumbnail_url) || image;
          const isStarting = requestedEpisode.current?.id === episode.id && isAuthorizing;
          return (
            <Pressable key={episode.id} onPress={() => startEpisode(episode)} disabled={!episode.has_media || isCheckingAccess || isAuthorizing} style={[styles.episodeRow, !episode.has_media && styles.disabled]} accessibilityRole="button" accessibilityLabel={`Play ${episode.title}`}>
              <View style={styles.episodeArtwork}>
                {thumbnail ? <Image source={{ uri: thumbnail }} style={styles.episodeImage} resizeMode="cover" /> : null}
                <View style={styles.episodePlay}>{isStarting ? <ActivityIndicator color="#fff" size="small" /> : <MaterialCommunityIcons name="play" size={20} color="#fff" />}</View>
                <Text style={styles.episodeNumber}>{episode.episode_number}</Text>
              </View>
              <View style={styles.episodeCopy}>
                <Text style={styles.episodeTitle} numberOfLines={2}>{episode.title}</Text>
                <Text style={styles.episodeMeta}>Episode {episode.episode_number}{formatEpisodeDuration(episode.duration_seconds) ? `  ·  ${formatEpisodeDuration(episode.duration_seconds)}` : ""}</Text>
                {episode.description ? <Text style={styles.episodeDescription} numberOfLines={2}>{episode.description}</Text> : null}
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textSecondary} />
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContent: { paddingHorizontal: 0 },
  hero: { minHeight: 520, backgroundColor: colors.surface },
  heroImage: { opacity: 0.9 },
  heroShade: { flex: 1, paddingHorizontal: 20, paddingBottom: 26, justifyContent: "space-between" },
  heroTopBar: { paddingTop: 8, alignItems: "flex-start" },
  heroIconButton: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(5,6,9,0.62)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  heroCopy: { gap: 11 },
  eyebrow: { color: colors.primary, fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1.1 },
  title: { color: "#fff", fontSize: 36, fontWeight: "900", lineHeight: 40 },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 12 },
  rating: { color: "#fff", fontSize: 14, fontWeight: "800" },
  metaText: { color: "#d8dbe2", fontSize: 13, fontWeight: "600" },
  accessBadge: { color: colors.textPrimary, fontSize: 10, fontWeight: "800", textTransform: "uppercase", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)", backgroundColor: "rgba(5,6,9,0.35)" },
  heroDescription: { color: "rgba(255,255,255,0.82)", fontSize: 14, lineHeight: 20 },
  playButton: { minHeight: 50, borderRadius: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.primary },
  playButtonText: { color: "#11131a", fontSize: 16, fontWeight: "800" },
  disabled: { opacity: 0.5 },
  playerSection: { backgroundColor: "#000", paddingHorizontal: 12, paddingBottom: 12 },
  playerHeader: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 10 },
  headerIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  playerTitle: { flex: 1, color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
  body: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 32 },
  sectionHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 14 },
  sectionEyebrow: { color: colors.primary, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8 },
  sectionTitle: { marginTop: 3, color: colors.textPrimary, fontSize: 22, fontWeight: "900" },
  episodeCount: { color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
  seasonTabs: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  seasonTab: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  seasonTabActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  seasonTabText: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  seasonTabTextActive: { color: "#11131a" },
  loading: { marginVertical: 24 },
  episodeRow: { flexDirection: "row", alignItems: "center", gap: 13, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  episodeArtwork: { width: 118, aspectRatio: 16 / 9, borderRadius: 7, overflow: "hidden", backgroundColor: colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  episodeImage: { width: "100%", height: "100%", opacity: 0.72 },
  episodePlay: { position: "absolute", width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(5,6,9,0.75)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)" },
  episodeNumber: { position: "absolute", left: 7, bottom: 5, color: "#fff", fontSize: 12, fontWeight: "900" },
  episodeCopy: { flex: 1, gap: 5 },
  episodeTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "800", lineHeight: 19 },
  episodeMeta: { color: colors.textSecondary, fontSize: 11, fontWeight: "700" },
  episodeDescription: { color: "#a4a9b5", fontSize: 12, lineHeight: 17 },
  error: { marginVertical: 8, color: colors.danger, fontSize: 13 },
  empty: { paddingVertical: 22, color: colors.textSecondary },
});