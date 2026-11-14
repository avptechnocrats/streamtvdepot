import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, ImageBackground, Pressable, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import { BackTitleHeader } from "@/components/common/BackTitleHeader";
import { PrimaryButton } from "@/components/common/PrimaryButton";
import { Screen } from "@/components/common/Screen";
import { OttVideoPlayer } from "@/components/content/OttVideoPlayer";
import { usePlayGate } from "@/hooks/usePlayGate";
import { RootStackParamList } from "@/navigation/types";
import { authorizeSeriesEpisode, fetchSeriesDetails, fetchSeriesEpisodes, SeriesEpisode } from "@/services/seriesService";
import { PlaybackSource } from "@/services/playbackService";
import { colors } from "@/theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "SeriesDetails">;

export function SeriesDetailsScreen({ route, navigation }: Props) {
  const { seriesId } = route.params;
  const [playback, setPlayback] = useState<{ episode: SeriesEpisode; source: PlaybackSource } | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const requestedEpisode = useRef<SeriesEpisode | null>(null);
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

  if (seriesLoading || !series) {
    return (
      <Screen>
        <BackTitleHeader title="Series" onBack={() => navigation.goBack()} />
        <ActivityIndicator color={colors.primary} />
      </Screen>
    );
  }

  const image = series.thumbnails?.video_banner || series.thumbnail_url || undefined;

  return (
    <Screen>
      <BackTitleHeader title="Series" onBack={() => navigation.goBack()} />
      <ImageBackground source={image ? { uri: image } : undefined} style={styles.hero} imageStyle={styles.heroImage}>
        <View style={styles.heroOverlay}>
          <Text style={styles.title}>{series.title}</Text>
          <Text style={styles.metadata}>{series.total_seasons} {series.total_seasons === 1 ? "Season" : "Seasons"}{series.rating ? `  ·  ★ ${series.rating.toFixed(1)}` : ""}</Text>
          {series.description ? <Text style={styles.description} numberOfLines={4}>{series.description}</Text> : null}
        </View>
      </ImageBackground>

      {playback ? (
        <View style={styles.playerWrap}>
          <Pressable style={styles.closePlayer} onPress={() => setPlayback(null)} accessibilityRole="button" accessibilityLabel="Close player">
            <MaterialCommunityIcons name="close" size={20} color={colors.textPrimary} />
          </Pressable>
          <OttVideoPlayer contentId={playback.episode.id} source={playback.source} />
        </View>
      ) : null}

      <Text style={styles.episodesTitle}>Episodes</Text>
      {playbackError ? <Text style={styles.error}>{playbackError}</Text> : null}
      {episodesLoading ? <ActivityIndicator color={colors.primary} /> : null}
      {!episodesLoading && !episodes.length ? <Text style={styles.empty}>Episodes are coming soon.</Text> : null}
      {episodes.map((episode) => (
        <View key={episode.id} style={styles.episodeRow}>
          <View style={styles.episodeCopy}>
            <Text style={styles.episodeTitle} numberOfLines={2}>{episode.title}</Text>
            <Text style={styles.episodeMeta}>S{episode.season_number} E{episode.episode_number}{episode.duration_seconds ? `  ·  ${Math.max(1, Math.round(episode.duration_seconds / 60))} min` : ""}</Text>
            {episode.description ? <Text style={styles.episodeDescription} numberOfLines={2}>{episode.description}</Text> : null}
          </View>
          <PrimaryButton
            label={isCheckingAccess ? "Checking..." : isAuthorizing ? "Starting..." : "Play"}
            onPress={() => {
              requestedEpisode.current = episode;
              handlePlay();
            }}
            disabled={!episode.has_media || isCheckingAccess || isAuthorizing}
          />
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    minHeight: 270,
    justifyContent: "flex-end",
    overflow: "hidden",
    borderRadius: 6,
    backgroundColor: colors.surface,
  },
  heroImage: { opacity: 0.62 },
  heroOverlay: {
    padding: 18,
    gap: 8,
    backgroundColor: "rgba(5, 6, 9, 0.62)",
  },
  title: { color: colors.textPrimary, fontSize: 28, fontWeight: "800" },
  metadata: { color: colors.textPrimary, fontSize: 13, fontWeight: "600" },
  description: { color: colors.textPrimary, fontSize: 14, lineHeight: 20 },
  playerWrap: { marginTop: 16 },
  closePlayer: {
    alignSelf: "flex-end",
    padding: 8,
    marginBottom: 4,
    borderRadius: 4,
    backgroundColor: colors.surface,
  },
  episodesTitle: { marginTop: 22, marginBottom: 8, color: colors.textPrimary, fontSize: 20, fontWeight: "800" },
  episodeRow: {
    minHeight: 92,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  episodeCopy: { flex: 1, gap: 5 },
  episodeTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
  episodeMeta: { color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
  episodeDescription: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  error: { marginBottom: 8, color: colors.danger, fontSize: 13 },
  empty: { paddingVertical: 18, color: colors.textSecondary },
});