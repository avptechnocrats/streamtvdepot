import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ImageBackground, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { BackTitleHeader } from "@/components/common/BackTitleHeader";
import { PrimaryButton } from "@/components/common/PrimaryButton";
import { Screen } from "@/components/common/Screen";
import { OttVideoPlayer } from "@/components/content/OttVideoPlayer";
import { usePlayGate } from "@/hooks/usePlayGate";
import { RootStackParamList } from "@/navigation/types";
import { getLiveTvChannel } from "@/services/contentService";
import { colors } from "@/theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "LiveTvChannel">;

function sanitizeImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const lowered = trimmed.toLowerCase();
  if (lowered === "null" || lowered === "undefined") return null;
  return trimmed;
}

export function LiveTvChannelScreen({ route, navigation }: Props) {
  const { channelId } = route.params;
  const [playRequested, setPlayRequested] = useState(false);

  const { data: channel } = useQuery({
    queryKey: ["live-tv-channel", channelId],
    queryFn: () => getLiveTvChannel(channelId),
    staleTime: 60 * 1000,
  });

  const playbackSource = useMemo(() => {
    const uri = channel?.stream_url ?? "";
    if (!uri) return null;
    const lower = uri.toLowerCase();
    const protocol = lower.includes(".m3u8") ? "hls" : lower.includes(".mpd") ? "dash" : lower.includes(".mp4") ? "mp4" : "unknown";

    return {
      uri,
      protocol,
      drmEnabled: false,
    } as const;
  }, [channel?.stream_url]);

  const heroUri =
    sanitizeImageUrl(channel?.thumbnails.banner)
    || sanitizeImageUrl(channel?.thumbnails.wide)
    || sanitizeImageUrl(channel?.thumbnails.portrait)
    || null;
  const { handlePlay, isCheckingAccess } = usePlayGate({
    contentId: channelId,
    accessType: channel?.access_type === "subscription" ? "subscription" : channel?.access_type === "pay_per_view" ? "pay_per_view" : "free",
    onAllowedPlay: () => setPlayRequested(true),
  });

  return (
    <Screen>
      <BackTitleHeader
        title={channel?.title || "Channel"}
        subtitle={channel?.is_live ? "Live Now" : "Live Channel"}
        onBack={() => navigation.goBack()}
      />

      {heroUri ? (
        <ImageBackground
          source={{ uri: heroUri }}
          imageStyle={styles.heroImage}
          style={styles.hero}
        >
          <View style={styles.heroOverlay}>
            <Text style={styles.heroTitle}>{channel?.title || "Loading..."}</Text>
            <Text style={styles.heroDesc} numberOfLines={3}>{channel?.description || "Live channel stream"}</Text>
          </View>
        </ImageBackground>
      ) : (
        <View style={styles.hero}>
          <View style={styles.heroOverlay}>
            <Text style={styles.heroTitle}>{channel?.title || "Loading..."}</Text>
            <Text style={styles.heroDesc} numberOfLines={3}>{channel?.description || "Live channel stream"}</Text>
          </View>
        </View>
      )}

      {channel?.is_live && playbackSource && playRequested ? (
        <OttVideoPlayer contentId={channelId} source={playbackSource} startPositionSeconds={0} />
      ) : (
        <View style={styles.accessWrap}>
          <Text style={styles.noStreamText}>{channel?.is_live ? "Access this channel to start watching live." : "This channel is currently offline."}</Text>
          {channel?.is_live ? <PrimaryButton label={isCheckingAccess ? "Checking access..." : "Watch Live"} onPress={handlePlay} disabled={isCheckingAccess} /> : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    marginTop: 14,
    minHeight: 200,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  heroImage: {
    opacity: 0.7,
  },
  heroOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 12,
    backgroundColor: "rgba(5, 8, 12, 0.4)",
    gap: 6,
  },
  heroTitle: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: "800",
  },
  heroDesc: {
    color: "#d3d9e2",
    lineHeight: 18,
  },
  noStreamText: {
    marginTop: 14,
    color: colors.textSecondary,
  },
  accessWrap: {
    marginTop: 14,
    gap: 12,
  },
});
