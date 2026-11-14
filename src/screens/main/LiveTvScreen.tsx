import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { FlatList, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import { BackTitleHeader } from "@/components/common/BackTitleHeader";
import { Screen } from "@/components/common/Screen";
import { PosterCardSkeleton } from "@/components/content/PosterCardSkeleton";
import { EpgProgram, LiveTvChannelOut, fetchLiveTvEpg, listLiveTvChannels } from "@/services/contentService";
import { RootStackParamList } from "@/navigation/types";
import { colors } from "@/theme/colors";
import { SkeletonBlock } from "@/components/common/SkeletonBlock";

const MIN_PX = 3;
const WINDOW_HOURS = 3;
const CHANNEL_COL = 140;
const ROW_HEIGHT = 58;
const HALF_HOUR_MS = 30 * 60 * 1000;

function sanitizeImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const lowered = trimmed.toLowerCase();
  if (lowered === "null" || lowered === "undefined") return null;
  return trimmed;
}

function roundDownToHour(date: Date): Date {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d;
}

function formatHHMM(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function chooseBanner(channel: LiveTvChannelOut): string | null {
  return (
    sanitizeImageUrl(channel.thumbnails.banner)
    || sanitizeImageUrl(channel.thumbnails.wide)
    || sanitizeImageUrl(channel.thumbnails.portrait)
    || null
  );
}

function choosePoster(channel: LiveTvChannelOut): string | null {
  return (
    sanitizeImageUrl(channel.thumbnails.portrait)
    || sanitizeImageUrl(channel.thumbnails.wide)
    || sanitizeImageUrl(channel.thumbnails.banner)
    || null
  );
}

function ProgramPill({
  prog,
  windowStartMs,
  windowEndMs,
  nowMs,
}: {
  prog: EpgProgram;
  windowStartMs: number;
  windowEndMs: number;
  nowMs: number;
}) {
  const startMs = new Date(prog.start_time).getTime();
  const endMs = new Date(prog.end_time).getTime();
  const visibleStartMs = Math.max(startMs, windowStartMs);
  const visibleEndMs = Math.min(endMs, windowEndMs);
  if (visibleEndMs <= visibleStartMs) return null;

  const leftPx = ((visibleStartMs - windowStartMs) / 60_000) * MIN_PX;
  const widthPx = Math.max(((visibleEndMs - visibleStartMs) / 60_000) * MIN_PX - 2, 10);

  const isCurrent = startMs <= nowMs && endMs > nowMs;
  const progressPct = isCurrent ? Math.min(100, ((nowMs - startMs) / (endMs - startMs)) * 100) : 0;

  return (
    <View
      style={[
        styles.programPill,
        isCurrent ? styles.programPillLive : styles.programPillDefault,
        { left: leftPx, width: widthPx },
      ]}
    >
      {isCurrent ? <View style={[styles.programProgress, { width: `${progressPct}%` }]} /> : null}
      <Text style={styles.programTitle} numberOfLines={1}>{prog.title}</Text>
      {widthPx > 90 ? <Text style={styles.programMeta} numberOfLines={1}>{formatHHMM(new Date(prog.start_time))}</Text> : null}
    </View>
  );
}

function BannerSlider({
  channels,
  onOpenChannel,
}: {
  channels: LiveTvChannelOut[];
  onOpenChannel: (channelId: string) => void;
}) {
  const { width } = useWindowDimensions();
  const [activeSlide, setActiveSlide] = useState(0);

  if (!channels.length) return null;

  return (
    <View style={styles.bannerSection}>
      <FlatList
        data={channels}
        horizontal
        pagingEnabled
        decelerationRate="fast"
        keyExtractor={(item) => `banner-${item.id}`}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) => {
          const offsetX = event.nativeEvent.contentOffset.x;
          const nextIndex = Math.round(offsetX / (width - 32));
          setActiveSlide(nextIndex);
        }}
        renderItem={({ item }) => {
          const banner = chooseBanner(item);
          return (
            <Pressable style={[styles.bannerCard, { width: width - 32 }]} onPress={() => onOpenChannel(item.id)}>
              {banner ? <Image source={{ uri: banner }} style={styles.bannerImage} resizeMode="cover" /> : null}
              <View style={styles.bannerOverlay}>
                <Text style={styles.bannerBadge}>{item.is_live ? "LIVE" : item.category || "TV"}</Text>
                <Text style={styles.bannerTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.bannerDesc} numberOfLines={2}>{item.description || "Live TV channel"}</Text>
              </View>
            </Pressable>
          );
        }}
      />

      <View style={styles.bannerDotsWrap}>
        {channels.map((item, index) => (
          <View key={`live-dot-${item.id}`} style={[styles.bannerDot, index === activeSlide && styles.bannerDotActive]} />
        ))}
      </View>
    </View>
  );
}

function TvChannelsRow({
  channels,
  onOpenChannel,
}: {
  channels: LiveTvChannelOut[];
  onOpenChannel: (channelId: string) => void;
}) {
  if (!channels.length) return null;

  return (
    <View style={styles.channelsSection}>
      <Text style={styles.sectionTitle}>TV Channels</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.channelsScrollContent}>
        {channels.map((channel) => {
          const poster = choosePoster(channel);
          return (
            <Pressable key={channel.id} style={styles.channelCard} onPress={() => onOpenChannel(channel.id)}>
              {poster ? <Image source={{ uri: poster }} style={styles.channelImage} resizeMode="cover" /> : null}
              {channel.is_live ? <Text style={styles.liveBadge}>LIVE</Text> : null}
              <View style={styles.channelMetaWrap}>
                <Text style={styles.channelName} numberOfLines={1}>{channel.title}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function LiveTvScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [now, setNow] = useState(() => new Date());
  const [windowStart, setWindowStart] = useState(() => roundDownToHour(new Date()));
  const timelineRef = useRef<ScrollView | null>(null);
  const leftColumnRef = useRef<ScrollView | null>(null);

  const { data: channels = [], isLoading } = useQuery({
    queryKey: ["live-tv"],
    queryFn: listLiveTvChannels,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const windowStartMs = windowStart.getTime();
  const windowEndMs = windowStartMs + WINDOW_HOURS * 3_600_000;
  const nowMs = now.getTime();
  const dateKey = useMemo(() => formatDateKey(windowStart), [windowStart]);

  const liveGuideChannels = useMemo(
    () => channels.filter((c) => c.source === "rtmp" || c.source === "srt"),
    [channels],
  );

  const epgQueries = useQueries({
    queries: liveGuideChannels.map((ch) => ({
      queryKey: ["live-tv-epg", ch.id, dateKey],
      queryFn: () => fetchLiveTvEpg(ch.id, dateKey, 1),
      staleTime: 5 * 60 * 1000,
      retry: 1,
    })),
  });

  const epgLoading = epgQueries.some((query) => query.isLoading);

  useEffect(() => {
    if (!timelineRef.current) return;
    const offsetMs = nowMs - windowStartMs;
    if (offsetMs <= 0) return;
    const scrollX = Math.max(0, (offsetMs / 60_000) * MIN_PX - 60);
    timelineRef.current.scrollTo({ x: scrollX, animated: false });
  }, [windowStartMs, nowMs]);

  const onOpenChannel = (channelId: string) => {
    navigation.navigate("LiveTvChannel", { channelId });
  };

  const ticks = Array.from({ length: WINDOW_HOURS * 2 + 1 }, (_, i) => {
    const ms = windowStartMs + i * HALF_HOUR_MS;
    return { ms, label: formatHHMM(new Date(ms)) };
  });

  const timelineWidth = WINDOW_HOURS * 60 * MIN_PX;
  const nowLineLeft = ((nowMs - windowStartMs) / 60_000) * MIN_PX;

  const onBackPress = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate("Main");
  };

  return (
    <Screen>
      <BackTitleHeader title="Live TV" subtitle="Channels and TV Guide" onBack={onBackPress} />
      {isLoading ? (
        <View style={styles.grid}>
          {Array.from({ length: 4 }).map((_, index) => (
            <View key={`live-skeleton-${index}`} style={styles.cardWrap}>
              <PosterCardSkeleton />
            </View>
          ))}
        </View>
      ) : (
        <>
          <BannerSlider channels={channels} onOpenChannel={onOpenChannel} />
          <TvChannelsRow channels={channels} onOpenChannel={onOpenChannel} />

          <View style={styles.guideSection}>
            <View style={styles.guideHeaderRow}>
              <Text style={styles.sectionTitle}>TV Guide</Text>
              <View style={styles.guideControls}>
                <Pressable onPress={() => setWindowStart((prev) => new Date(prev.getTime() - 3_600_000))} style={styles.guideControlBtn}>
                  <MaterialCommunityIcons name="chevron-left" size={16} color={colors.textSecondary} />
                </Pressable>
                <Pressable onPress={() => setWindowStart(roundDownToHour(new Date()))} style={styles.nowBtn}>
                  <Text style={styles.nowBtnText}>Now</Text>
                </Pressable>
                <Pressable onPress={() => setWindowStart((prev) => new Date(prev.getTime() + 3_600_000))} style={styles.guideControlBtn}>
                  <MaterialCommunityIcons name="chevron-right" size={16} color={colors.textSecondary} />
                </Pressable>
              </View>
            </View>

            {epgLoading ? (
              <View style={styles.epgSkeletonWrap}>
                {Array.from({ length: 5 }).map((_, index) => (
                  <SkeletonBlock key={`guide-skeleton-${index}`} style={styles.epgSkeleton} />
                ))}
              </View>
            ) : (
              <View style={styles.guideContainer}>
                <View style={styles.guideBody}>
                  <View style={styles.leftFixedPane}>
                    <View style={styles.channelColHeader}>
                      <Text style={styles.channelColHeaderText}>Channel</Text>
                    </View>
                    <ScrollView
                      ref={leftColumnRef}
                      scrollEnabled={false}
                      showsVerticalScrollIndicator={false}
                      style={styles.leftColumnScroll}
                      contentContainerStyle={styles.leftColumnContent}
                    >
                      {liveGuideChannels.map((channel) => {
                        const logo = choosePoster(channel);
                        return (
                          <Pressable
                            key={`guide-left-${channel.id}`}
                            style={styles.channelCol}
                            onPress={() => onOpenChannel(channel.id)}
                          >
                            {logo ? <Image source={{ uri: logo }} style={styles.channelLogo} resizeMode="cover" /> : null}
                            <View style={styles.channelColTextWrap}>
                              <Text style={styles.channelColName} numberOfLines={1}>{channel.title}</Text>
                              {channel.is_live ? <Text style={styles.channelColLive}>LIVE</Text> : null}
                            </View>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>

                  <ScrollView
                    ref={timelineRef}
                    horizontal
                    showsHorizontalScrollIndicator
                    style={styles.rightTimelineScroll}
                    scrollEventThrottle={16}
                  >
                    <View style={{ width: timelineWidth }}>
                      <View style={styles.timelineHeaderRow}>
                        {ticks.map((tick) => {
                          const leftPx = ((tick.ms - windowStartMs) / 60_000) * MIN_PX;
                          return (
                            <View key={`tick-${tick.ms}`} style={[styles.tickWrap, { left: leftPx }]}>
                              <View style={styles.tickLine} />
                              <Text style={styles.tickLabel}>{tick.label}</Text>
                            </View>
                          );
                        })}
                      </View>

                      <ScrollView
                        style={styles.rightRowsScroll}
                        showsVerticalScrollIndicator
                        scrollEventThrottle={16}
                        onScroll={(event) => {
                          const y = event.nativeEvent.contentOffset.y;
                          leftColumnRef.current?.scrollTo({ y, animated: false });
                        }}
                      >
                        <View style={{ width: timelineWidth, position: "relative" }}>
                          {nowMs >= windowStartMs && nowMs <= windowEndMs ? (
                            <View style={[styles.nowLine, { left: nowLineLeft, height: liveGuideChannels.length * ROW_HEIGHT }]} />
                          ) : null}

                          {liveGuideChannels.map((channel, idx) => {
                            const programs = (epgQueries[idx]?.data ?? []) as EpgProgram[];

                            return (
                              <Pressable
                                key={`guide-right-${channel.id}`}
                                style={styles.programLane}
                                onPress={() => onOpenChannel(channel.id)}
                              >
                                {programs.length ? (
                                  programs.map((prog) => (
                                    <ProgramPill
                                      key={`${prog.id}-${prog.start_time}`}
                                      prog={prog}
                                      windowStartMs={windowStartMs}
                                      windowEndMs={windowEndMs}
                                      nowMs={nowMs}
                                    />
                                  ))
                                ) : (
                                  <Text style={styles.noSchedule}>No schedule available</Text>
                                )}
                              </Pressable>
                            );
                          })}
                        </View>
                      </ScrollView>
                    </View>
                  </ScrollView>
                </View>
              </View>
            )}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  bannerSection: {
    marginTop: 14,
  },
  bannerCard: {
    height: 220,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bannerImage: {
    width: "100%",
    height: "100%",
  },
  bannerOverlay: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    padding: 12,
    backgroundColor: "rgba(5, 8, 12, 0.45)",
    gap: 4,
  },
  bannerBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
  },
  bannerTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: "800",
  },
  bannerDesc: {
    color: "#d3d9e2",
    fontSize: 12,
  },
  bannerDotsWrap: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  bannerDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.32)",
  },
  bannerDotActive: {
    width: 18,
    borderRadius: 999,
    backgroundColor: "#ffffff",
  },
  channelsSection: {
    marginTop: 18,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 10,
  },
  channelsScrollContent: {
    paddingRight: 8,
  },
  channelCard: {
    width: 132,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 10,
  },
  channelImage: {
    width: "100%",
    height: 142,
    backgroundColor: colors.surfaceMuted,
  },
  channelMetaWrap: {
    padding: 8,
  },
  channelName: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  liveBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    fontSize: 10,
    fontWeight: "800",
    color: "#fff",
    backgroundColor: "#cc0000",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: "hidden",
  },
  guideSection: {
    marginTop: 20,
    marginBottom: 14,
  },
  guideHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  guideControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  guideControlBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  nowBtn: {
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  nowBtnText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
  },
  guideContainer: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  guideTopRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  channelColHeader: {
    width: CHANNEL_COL,
    height: 30,
    justifyContent: "center",
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  channelColHeaderText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
  },
  timelineHeaderScroll: {
    flex: 1,
  },
  guideBody: {
    flexDirection: "row",
  },
  leftFixedPane: {
    width: CHANNEL_COL,
  },
  leftColumnScroll: {
    width: CHANNEL_COL,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    maxHeight: 420,
    backgroundColor: colors.surface,
  },
  leftColumnContent: {
    width: CHANNEL_COL,
  },
  rightTimelineScroll: {
    flex: 1,
  },
  timelineHeaderRow: {
    height: 30,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  rightRowsScroll: {
    maxHeight: 420,
  },
  tickWrap: {
    position: "absolute",
    top: 0,
    height: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tickLine: {
    width: 1,
    height: 12,
    backgroundColor: colors.border,
  },
  tickLabel: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: "600",
  },
  channelCol: {
    width: CHANNEL_COL,
    height: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    overflow: "hidden",
  },
  channelLogo: {
    width: 34,
    height: 34,
    borderRadius: 6,
    backgroundColor: colors.surfaceMuted,
  },
  channelColTextWrap: {
    flex: 1,
  },
  channelColName: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  channelColLive: {
    marginTop: 1,
    color: "#ff4d4f",
    fontSize: 10,
    fontWeight: "700",
  },
  programLane: {
    height: ROW_HEIGHT,
    position: "relative",
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    overflow: "hidden",
  },
  programPill: {
    position: "absolute",
    top: 6,
    bottom: 6,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    justifyContent: "center",
    overflow: "hidden",
  },
  programPillDefault: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: colors.border,
  },
  programPillLive: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: colors.primary,
  },
  programProgress: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(74, 144, 226, 0.26)",
  },
  programTitle: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: "700",
  },
  programMeta: {
    marginTop: 1,
    color: colors.textSecondary,
    fontSize: 10,
  },
  noSchedule: {
    color: colors.textSecondary,
    fontSize: 11,
    fontStyle: "italic",
    marginLeft: 8,
  },
  nowLine: {
    position: "absolute",
    top: 0,
    width: 2,
    backgroundColor: "#ff4d4f",
    zIndex: 5,
  },
  grid: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
  },
  cardWrap: { flex: 1, alignItems: "center" },
  epgSkeletonWrap: {
    gap: 8,
  },
  epgSkeleton: {
    height: 48,
    borderRadius: 8,
  },
});
