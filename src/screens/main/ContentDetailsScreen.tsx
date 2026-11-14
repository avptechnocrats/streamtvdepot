import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, ImageBackground, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Screen } from "@/components/common/Screen";
import { PrimaryButton } from "@/components/common/PrimaryButton";
import { OttVideoPlayer } from "@/components/content/OttVideoPlayer";
import { usePlayGate } from "@/hooks/usePlayGate";
import { RootStackParamList } from "@/navigation/types";
import { buildPlaybackSource } from "@/services/playbackService";
import { fetchContentDetails } from "@/services/contentService";
import { addToWatchlist, getWatchlist, removeFromWatchlist } from "@/services/watchlistService";
import { usePlayerStore } from "@/store/playerStore";
import { useAuthStore } from "@/store/authStore";
import { colors } from "@/theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "ContentDetails">;

export function ContentDetailsScreen({ route }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { contentId } = route.params;
  const [playRequested, setPlayRequested] = useState(false);
  const [watchlisted, setWatchlisted] = useState(false);
  const setLastPlayed = usePlayerStore((s) => s.setLastPlayed);
  const lastPositionSecondsByContentId = usePlayerStore((s) => s.lastPositionSecondsByContentId);
  const token = useAuthStore((s) => s.token);

  const { data } = useQuery({
    queryKey: ["content", contentId],
    queryFn: () => fetchContentDetails(contentId),
  });
  const watchlistQuery = useQuery({
    queryKey: ["watchlist"],
    queryFn: getWatchlist,
    enabled: Boolean(token),
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
      setPlayRequested(true);
    },
  });

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

  return (
    <Screen>
      <ImageBackground source={data?.thumbnails?.video_banner ? { uri: data.thumbnails.video_banner } : undefined} style={styles.hero} imageStyle={styles.heroImage}>
        <View style={styles.overlay}>
          <Text style={styles.title}>{data?.title || "Loading title..."}</Text>
          <Text style={styles.description}>
            {data?.long_description || data?.description || "OTT-ready playback page with DRM-ready flow, adaptive stream support, and personalized watch state."}
          </Text>
          <PrimaryButton
            label={isCheckingAccess ? "Checking access..." : "Play"}
            onPress={handlePlay}
            disabled={isCheckingAccess}
          />
          <Pressable style={styles.watchlistButton} onPress={handleWatchlistToggle}>
            <Text style={styles.watchlistText}>{watchlisted ? "Remove from Watchlist" : "Add to Watchlist"}</Text>
          </Pressable>
        </View>
      </ImageBackground>

      {playRequested && playbackSource ? (
        <OttVideoPlayer
          contentId={contentId}
          source={playbackSource}
          startPositionSeconds={lastPositionSecondsByContentId[contentId] ?? 0}
        />
      ) : null}

      {playRequested && !playbackSource ? (
        <Text style={styles.noStreamText}>No playable stream URL found for this content.</Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    marginTop: 14,
    minHeight: 360,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  heroImage: { opacity: 0.75 },
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(5, 8, 12, 0.55)",
    padding: 16,
    gap: 10,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 30,
    fontWeight: "800",
  },
  description: {
    color: "#d3d9e2",
    lineHeight: 20,
  },
  watchlistButton: {
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  watchlistText: {
    color: colors.textPrimary,
    fontWeight: "700",
  },
  noStreamText: {
    marginTop: 14,
    color: colors.textSecondary,
  },
});
