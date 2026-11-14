import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ImageBackground, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { BackTitleHeader } from "@/components/common/BackTitleHeader";
import { PrimaryButton } from "@/components/common/PrimaryButton";
import { Screen } from "@/components/common/Screen";
import { OttVideoPlayer } from "@/components/content/OttVideoPlayer";
import { usePlayGate } from "@/hooks/usePlayGate";
import { RootStackParamList } from "@/navigation/types";
import { fetchPpvEvent } from "@/services/ppvService";
import { usePlayerStore } from "@/store/playerStore";
import { colors } from "@/theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "PpvEventDetails">;

export function PpvEventDetailsScreen({ route, navigation }: Props) {
  const { eventId } = route.params;
  const [playRequested, setPlayRequested] = useState(false);
  const setLastPlayed = usePlayerStore((state) => state.setLastPlayed);
  const { data: event, isLoading } = useQuery({ queryKey: ["ppv-event", eventId], queryFn: () => fetchPpvEvent(eventId) });
  const { handlePlay, isCheckingAccess } = usePlayGate({
    contentId: eventId,
    accessType: "pay_per_view",
    planId: event?.pricing_plan_id ?? undefined,
    onAllowedPlay: () => {
      setLastPlayed(eventId);
      setPlayRequested(true);
    },
  });

  const image = event?.thumbnails.banner || event?.thumbnails.wide || event?.thumbnails.portrait;
  const playbackSource = event?.stream_url ? { uri: event.stream_url, protocol: "hls" as const, drmEnabled: false } : null;

  return (
    <Screen>
      <BackTitleHeader title="PPV Event" onBack={() => navigation.goBack()} />
      {isLoading ? <Text style={styles.status}>Loading event...</Text> : null}
      {event ? (
        <>
          <ImageBackground source={image ? { uri: image } : undefined} style={styles.hero} imageStyle={styles.heroImage}>
            <View style={styles.overlay}>
              <Text style={styles.live}>{event.is_live ? "● LIVE NOW" : "OFFLINE"}</Text>
              <Text style={styles.title}>{event.title}</Text>
              <Text style={styles.description}>{event.description || "Purchase access to watch this exclusive event."}</Text>
              <PrimaryButton
                label={isCheckingAccess ? "Checking access..." : playRequested ? "Playing" : event.is_live ? "Buy & Watch" : "Buy Access"}
                onPress={handlePlay}
                disabled={isCheckingAccess || playRequested}
              />
            </View>
          </ImageBackground>
          {playRequested && playbackSource ? <OttVideoPlayer contentId={eventId} source={playbackSource} /> : null}
          {!event.is_live ? <Text style={styles.status}>This event is not live right now.</Text> : null}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { marginTop: 14, minHeight: 360, borderRadius: 16, overflow: "hidden", backgroundColor: colors.surface },
  heroImage: { opacity: 0.7 },
  overlay: { flex: 1, justifyContent: "flex-end", padding: 16, gap: 10, backgroundColor: "rgba(5, 8, 12, 0.62)" },
  live: { color: "#f87171", fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  title: { color: colors.textPrimary, fontSize: 28, fontWeight: "800" },
  description: { color: "#d3d9e2", lineHeight: 20 },
  status: { marginTop: 20, color: colors.textSecondary, textAlign: "center" },
});
