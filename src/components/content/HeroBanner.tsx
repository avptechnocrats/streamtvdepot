import { useEffect, useState } from "react";
import { GestureResponderEvent, ImageBackground, Pressable, StyleSheet, Text, View } from "react-native";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ContentItem } from "@/types/models";
import { RootStackParamList } from "@/navigation/types";
import { useAuthStore } from "@/store/authStore";
import { addToWatchlist, getWatchlist, removeFromWatchlist } from "@/services/watchlistService";
import { colors } from "@/theme/colors";
import { SkeletonBlock } from "@/components/common/SkeletonBlock";
import { TrailerPreview } from "@/components/content/TrailerPreview";

interface HeroBannerProps {
  item: ContentItem;
  onOpen: () => void;
  isActive?: boolean;
  onTrailerEnd?: () => void;
}

function sanitizeImageUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const lowered = trimmed.toLowerCase();
  if (lowered === "null" || lowered === "undefined") return undefined;
  return trimmed;
}

export function HeroBanner({ item, onOpen, isActive = true, onTrailerEnd }: HeroBannerProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const token = useAuthStore((state) => state.token);
  const image =
    sanitizeImageUrl(item.thumbnails?.video_banner)
    || sanitizeImageUrl(item.thumbnails?.video_w_thumbnail)
    || undefined;
  const trailer = sanitizeImageUrl(item.trailer_hls_url) || sanitizeImageUrl(item.trailer_display_url);
  const [imageLoaded, setImageLoaded] = useState(!image);
  const contentType = item.content_type === "series" ? "series" : "video";
  const { data: watchlist = [] } = useQuery({
    queryKey: ["watchlist"],
    queryFn: getWatchlist,
    enabled: Boolean(token),
    staleTime: 60_000,
  });
  const inList = watchlist.some((entry) => entry.video_id === item.id && (entry.content_type ?? "video") === contentType);
  const watchlistMutation = useMutation({
    mutationFn: async () => {
      if (inList) {
        await removeFromWatchlist(item.id);
      } else {
        await addToWatchlist(item.id, contentType);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  useEffect(() => {
    setImageLoaded(!image);
  }, [image]);

  const toggleWatchlist = (event: GestureResponderEvent) => {
    event.stopPropagation();
    if (!token) {
      navigation.navigate("Auth");
      return;
    }
    watchlistMutation.mutate();
  };

  const openDetails = (event: GestureResponderEvent) => {
    event.stopPropagation();
    onOpen();
  };

  return (
      <ImageBackground
        source={image ? { uri: image } : undefined}
        imageStyle={styles.image}
        style={styles.banner}
        onLoadEnd={() => setImageLoaded(true)}
        onError={() => setImageLoaded(true)}
      >
        <TrailerPreview
          source={trailer}
          active={isActive}
          videoScale={1.35}
          startDelayMs={1200}
          onEnd={() => {
            if (isActive) onTrailerEnd?.();
          }}
        />
        {!imageLoaded ? <SkeletonBlock style={styles.skeleton} /> : null}
        <View pointerEvents="box-none" style={styles.overlay}>
          <Text style={styles.kicker}>Featured</Text>
          <Text numberOfLines={2} style={styles.title}>
            {item.title}
          </Text>
          <Text numberOfLines={2} style={styles.desc}>
            {item.description || "Discover this title on KalingoTV."}
          </Text>
          <View style={styles.actionRow}>
            <Pressable style={styles.playButton} onPress={openDetails} accessibilityRole="button" accessibilityLabel={`Play ${item.title}`}>
              <MaterialCommunityIcons name="play" size={17} color={colors.textPrimary} />
              <Text style={styles.playButtonLabel}>Play</Text>
            </Pressable>
            <Pressable
              style={styles.secondaryButton}
              onPress={toggleWatchlist}
              disabled={watchlistMutation.isPending}
              accessibilityRole="button"
              accessibilityLabel={inList ? "Remove from My List" : "Add to My List"}
              accessibilityState={{ selected: inList, disabled: watchlistMutation.isPending }}
            >
              <MaterialCommunityIcons name={inList ? "check" : "plus"} size={18} color={colors.textPrimary} />
            </Pressable>
            <Pressable
              style={styles.infoButton}
              onPress={openDetails}
              accessibilityRole="button"
              accessibilityLabel={`More information about ${item.title}`}
            >
              <MaterialCommunityIcons name="information-outline" size={19} color={colors.textPrimary} />
            </Pressable>
          </View>
        </View>
      </ImageBackground>
  );
}

const styles = StyleSheet.create({
  banner: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: colors.surface,
    marginTop: 14,
  },
  image: {
    opacity: 0.8,
  },
  skeleton: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    zIndex: 2,
    flex: 1,
    justifyContent: "flex-end",
    padding: 14,
    backgroundColor: "rgba(5, 6, 9, 0.52)",
    gap: 5,
  },
  kicker: {
    color: colors.primaryStrong,
    fontWeight: "700",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  title: {
    color: "white",
    fontSize: 23,
    fontWeight: "800",
  },
  desc: {
    color: "#d5dbe4",
    fontSize: 12,
    marginBottom: 3,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  playButton: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 9,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  playButtonLabel: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  secondaryButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
    backgroundColor: "rgba(0,0,0,0.32)",
  },
  infoButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
    backgroundColor: "rgba(0,0,0,0.32)",
  },
});
