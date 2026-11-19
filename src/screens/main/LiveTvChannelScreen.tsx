import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, Image, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import Video from "react-native-video";
import { BackTitleHeader } from "@/components/common/BackTitleHeader";
import { PrimaryButton } from "@/components/common/PrimaryButton";
import { Screen } from "@/components/common/Screen";
import { LiveTvGuide } from "@/components/content/LiveTvGuide";
import { usePlayGate } from "@/hooks/usePlayGate";
import { useFullscreenOrientation } from "@/hooks/useFullscreenOrientation";
import { RootStackParamList } from "@/navigation/types";
import { getLiveTvChannel, listLiveTvChannels, LiveTvChannelOut } from "@/services/contentService";
import { colors } from "@/theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "LiveTvChannel">;

const LIVE_CONTROLS_STYLES = { hidePrevious: true, hideNext: true };

function sanitizeImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const lowered = trimmed.toLowerCase();
  if (lowered === "null" || lowered === "undefined") return null;
  return trimmed;
}

function categoryLabel(value: string): string {
  return value.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ChannelRail({ title, channels, onOpen }: { title: string; channels: LiveTvChannelOut[]; onOpen: (id: string) => void }) {
  if (!channels.length) return null;

  return (
    <View style={styles.rail}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {channels.map((item) => {
          const image = sanitizeImageUrl(item.thumbnails.square) || sanitizeImageUrl(item.thumbnails.wide)
            || sanitizeImageUrl(item.thumbnails.banner) || sanitizeImageUrl(item.thumbnails.portrait);
          return (
            <Pressable key={item.id} style={styles.channelItem} onPress={() => onOpen(item.id)} accessibilityRole="button" accessibilityLabel={`Watch ${item.title}`}>
              <View style={styles.channelImageWrap}>
                {image ? <Image source={{ uri: image }} style={styles.channelImage} resizeMode={item.thumbnails.square ? "cover" : "contain"} /> : <MaterialCommunityIcons name="television" size={28} color={colors.textSecondary} />}
                {item.is_live ? <Text style={styles.liveBadge}>LIVE</Text> : null}
              </View>
              <Text numberOfLines={1} style={styles.channelName}>{item.title}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function LiveTvChannelScreen({ route, navigation }: Props) {
  const { channelId } = route.params;
  const fullscreenOrientation = useFullscreenOrientation();
  const { width } = useWindowDimensions();
  const isFocused = useIsFocused();
  const [playRequested, setPlayRequested] = useState(false);
  const [playbackError, setPlaybackError] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const { data: channel, isLoading, isError, refetch } = useQuery({
    queryKey: ["live-tv-channel", channelId],
    queryFn: () => getLiveTvChannel(channelId),
    staleTime: 60 * 1000,
  });
  const { data: channels = [] } = useQuery({
    queryKey: ["live-tv"],
    queryFn: () => listLiveTvChannels(100),
    staleTime: 5 * 60_000,
  });
  const { handlePlay, isCheckingAccess } = usePlayGate({
    contentId: channelId,
    accessType: channel?.access_type ?? "free",
    onAllowedPlay: () => setPlayRequested(true),
  });

  const streamUrl = sanitizeImageUrl(channel?.stream_url);
  const videoSource = useMemo(() => streamUrl ? { uri: streamUrl } : undefined, [streamUrl]);
  const poster = sanitizeImageUrl(channel?.thumbnails.banner) || sanitizeImageUrl(channel?.thumbnails.wide)
    || sanitizeImageUrl(channel?.thumbnails.portrait) || sanitizeImageUrl(channel?.thumbnails.square);
  const categories = channel?.categories ?? (channel?.category ? [channel.category] : []);
  const sharesCategory = (other: LiveTvChannelOut) => (other.categories ?? (other.category ? [other.category] : []))
    .some((category) => categories.includes(category));
  const related = channels.filter((other) => other.id !== channelId && categories.length > 0 && sharesCategory(other)).slice(0, 12);
  const otherChannels = channels.filter((other) => other.id !== channelId && !sharesCategory(other)).slice(0, 12);
  const guideChannels = channels.filter((other) => other.source === "rtmp" || other.source === "srt");
  const canPlay = channel?.access_type === "free" || playRequested;
  const canAttemptPlayback = Boolean(videoSource) && !channel?.managed_playback
    && (channel?.source === "external" || channel?.stream_status === "live" || channel?.is_live);
  const openChannel = (id: string) => navigation.push("LiveTvChannel", { channelId: id });

  return (
    <Screen>
      <BackTitleHeader title="Watch TV" onBack={() => navigation.goBack()} />
      {isLoading ? (
        <View style={[styles.loading, { width }]}><ActivityIndicator color={colors.primary} /></View>
      ) : isError || !channel ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Channel unavailable.</Text>
          <PrimaryButton label="Try Again" onPress={() => { void refetch(); }} />
        </View>
      ) : (
        <>
          <View style={[styles.player, { width }]}>
            {canPlay && canAttemptPlayback && !playbackError && isFocused ? (
              <>
                <Video source={videoSource} style={StyleSheet.absoluteFill} resizeMode="contain" controls playInBackground={false} playWhenInactive={false}
                  controlsStyles={LIVE_CONTROLS_STYLES}
                  fullscreenOrientation="landscape" fullscreenAutorotate={false} {...fullscreenOrientation}
                  onBuffer={({ isBuffering }) => setBuffering(isBuffering)}
                  onPlaybackStateChanged={({ isPlaying: playing }) => setIsPlaying(playing)}
                  onError={() => { setBuffering(false); setIsPlaying(false); setPlaybackError(true); }} />
                {buffering ? <View pointerEvents="none" style={styles.buffering}><ActivityIndicator color={colors.primary} /></View> : null}
              </>
            ) : (
              <ImageBackground source={poster ? { uri: poster } : undefined} style={styles.playerPlaceholder} imageStyle={styles.poster}>
                <View style={styles.playerShade}>
                  {!canPlay ? (
                    <>
                      <MaterialCommunityIcons name="lock-outline" size={30} color={colors.textPrimary} />
                      <Text style={styles.playerMessage}>{channel.access_type === "pay_per_view" ? "Pay Per View" : "Subscription required"}</Text>
                      <PrimaryButton label={isCheckingAccess ? "Checking access..." : channel.access_type === "pay_per_view" ? "Buy & Watch" : "Watch with Subscription"} onPress={handlePlay} disabled={isCheckingAccess} />
                    </>
                  ) : (
                    <>
                      <MaterialCommunityIcons name="wifi-off" size={30} color={colors.textSecondary} />
                      <Text style={styles.playerMessage}>{playbackError ? "Live stream is currently unavailable" : channel.managed_playback ? "Managed live playback is not available in the app yet." : "Stream not available"}</Text>
                      {playbackError && canAttemptPlayback ? <Pressable onPress={() => setPlaybackError(false)} accessibilityRole="button"><Text style={styles.retry}>Try Again</Text></Pressable> : null}
                    </>
                  )}
                </View>
              </ImageBackground>
            )}
          </View>

          <View style={styles.info}>
            <View style={styles.badges}>
              {channel.is_live ? <Text style={styles.liveBadgeInline}>LIVE</Text> : null}
              <Text style={styles.accessBadge}>{channel.access_type === "pay_per_view" ? "PPV" : channel.access_type.toUpperCase()}</Text>
              {categories.map((category) => <Text key={category} style={styles.categoryBadge}>{categoryLabel(category)}</Text>)}
            </View>
            <Text style={styles.title}>{channel.title}</Text>
            <View style={styles.metadata}>
              <View style={styles.metaItem}><MaterialCommunityIcons name={channel.is_live || isPlaying ? "broadcast" : "wifi"} size={16} color={colors.primary} /><Text style={styles.metaText}>{channel.is_live ? "Live Now" : isPlaying ? "Streaming" : channel.source === "external" && canAttemptPlayback && !playbackError ? "External stream" : "Offline"}</Text></View>
              {channel.language?.length ? <View style={styles.metaItem}><MaterialCommunityIcons name="web" size={16} color={colors.primary} /><Text style={styles.metaText}>{channel.language.join(", ")}</Text></View> : null}
              {channel.region?.length ? <View style={styles.metaItem}><MaterialCommunityIcons name="map-marker-outline" size={16} color={colors.primary} /><Text style={styles.metaText}>{channel.region.join(", ")}</Text></View> : null}
            </View>
            {channel.description ? <View style={styles.about}><Text style={styles.sectionTitle}>About</Text><Text style={styles.description}>{channel.description}</Text></View> : null}
          </View>

          <ChannelRail title={`More in ${categoryLabel(categories[0] ?? "this category")}`} channels={related} onOpen={openChannel} />
          {guideChannels.length ? <LiveTvGuide channels={guideChannels} onOpenChannel={openChannel} /> : null}
          <ChannelRail title="More Channels" channels={otherChannels} onOpen={openChannel} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: 16, marginHorizontal: -16, aspectRatio: 16 / 9, justifyContent: "center", backgroundColor: colors.surface },
  empty: { paddingVertical: 36, alignItems: "center", gap: 16 },
  emptyText: { color: colors.textSecondary, fontSize: 15 },
  player: { marginTop: 14, marginHorizontal: -16, aspectRatio: 16 / 9, overflow: "hidden", backgroundColor: "#000" },
  playerPlaceholder: { flex: 1 },
  poster: { opacity: 0.35 },
  playerShade: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 16, backgroundColor: "rgba(0,0,0,0.5)" },
  playerMessage: { color: colors.textPrimary, textAlign: "center", fontSize: 14, fontWeight: "600" },
  retry: { color: colors.primaryStrong, fontSize: 14, fontWeight: "700" },
  buffering: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  info: { paddingTop: 20, gap: 12 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  liveBadgeInline: { overflow: "hidden", color: "#fff", backgroundColor: "#c92837", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 3, fontSize: 10, fontWeight: "800" },
  accessBadge: { overflow: "hidden", color: colors.primaryStrong, borderWidth: 1, borderColor: colors.primary, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 3, fontSize: 10, fontWeight: "800" },
  categoryBadge: { overflow: "hidden", color: colors.textSecondary, backgroundColor: colors.surface, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 3, fontSize: 10, fontWeight: "600" },
  title: { color: colors.textPrimary, fontSize: 25, fontWeight: "800" },
  metadata: { gap: 8 },
  metaItem: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  metaText: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  about: { gap: 6, marginTop: 4 },
  description: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  rail: { marginTop: 24, gap: 12 },
  channelItem: { width: 104, marginRight: 12 },
  channelImageWrap: { width: 104, aspectRatio: 1, alignItems: "center", justifyContent: "center", overflow: "hidden", borderRadius: 6, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  channelImage: { width: "100%", height: "100%" },
  channelName: { marginTop: 6, color: colors.textPrimary, fontSize: 12, fontWeight: "600" },
  liveBadge: { position: "absolute", top: 4, left: 4, overflow: "hidden", color: "#fff", backgroundColor: "#c92837", paddingHorizontal: 4, paddingVertical: 2, borderRadius: 3, fontSize: 9, fontWeight: "800" },
  sectionTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "700" },
});
