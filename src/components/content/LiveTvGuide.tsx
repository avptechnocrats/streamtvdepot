import { useEffect, useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import { EpgProgram, fetchLiveTvEpg, LiveTvChannelOut } from "@/services/contentService";
import { colors } from "@/theme/colors";

const MIN_PX = 2.6;
const WINDOW_HOURS = 3;
const CHANNEL_COL = 130;

function roundDownToHour(date: Date) {
  const next = new Date(date);
  next.setMinutes(0, 0, 0);
  return next;
}

function formatHHMM(date: Date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

interface ProgramPillProps {
  program: EpgProgram;
  windowStartMs: number;
  windowEndMs: number;
  nowMs: number;
}

function ProgramPill({ program, windowStartMs, windowEndMs, nowMs }: ProgramPillProps) {
  const startMs = new Date(program.start_time).getTime();
  const endMs = new Date(program.end_time).getTime();

  const visibleStartMs = Math.max(startMs, windowStartMs);
  const visibleEndMs = Math.min(endMs, windowEndMs);
  if (visibleEndMs <= visibleStartMs) return null;

  const leftPx = ((visibleStartMs - windowStartMs) / 60_000) * MIN_PX;
  const widthPx = Math.max(((visibleEndMs - visibleStartMs) / 60_000) * MIN_PX - 2, 12);

  const isCurrent = startMs <= nowMs && endMs > nowMs;
  const progressPct = isCurrent ? Math.min(100, ((nowMs - startMs) / (endMs - startMs)) * 100) : 0;

  return (
    <View style={[styles.pill, isCurrent ? styles.pillCurrent : styles.pillDefault, { left: leftPx, width: widthPx }]}>
      {isCurrent ? <View style={[styles.pillProgress, { width: `${progressPct}%` }]} /> : null}
      <Text numberOfLines={1} style={[styles.pillText, isCurrent && styles.pillTextCurrent]}>{program.title}</Text>
    </View>
  );
}

interface LiveTvGuideProps {
  channels: LiveTvChannelOut[];
  onOpenChannel: (channelId: string) => void;
}

export function LiveTvGuide({ channels, onOpenChannel }: LiveTvGuideProps) {
  const [now, setNow] = useState(() => new Date());
  const [windowStart, setWindowStart] = useState(() => roundDownToHour(new Date()));

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const windowStartMs = windowStart.getTime();
  const windowEndMs = windowStartMs + WINDOW_HOURS * 3_600_000;
  const nowMs = now.getTime();
  const dateKey = useMemo(() => formatDateKey(windowStart), [windowStart]);

  const queries = useQueries({
    queries: channels.map((channel) => ({
      queryKey: ["live-tv-epg", channel.id, dateKey],
      queryFn: () => fetchLiveTvEpg(channel.id, dateKey, 1),
      staleTime: 5 * 60 * 1000,
      retry: 1,
    })),
  });

  const ticks = Array.from({ length: WINDOW_HOURS * 2 + 1 }, (_, index) => {
    const ms = windowStartMs + index * 30 * 60_000;
    return { ms, label: formatHHMM(new Date(ms)) };
  });

  const timelineWidth = WINDOW_HOURS * 60 * MIN_PX;
  const nowOffset = ((nowMs - windowStartMs) / 60_000) * MIN_PX;

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>TV Guide</Text>
        <View style={styles.actions}>
          <Pressable style={styles.iconBtn} onPress={() => setWindowStart((prev) => new Date(prev.getTime() - 60 * 60_000))}>
            <MaterialCommunityIcons name="chevron-left" size={16} color={colors.textPrimary} />
          </Pressable>
          <Pressable style={styles.nowBtn} onPress={() => setWindowStart(roundDownToHour(new Date()))}>
            <Text style={styles.nowBtnText}>Now</Text>
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={() => setWindowStart((prev) => new Date(prev.getTime() + 60 * 60_000))}>
            <MaterialCommunityIcons name="chevron-right" size={16} color={colors.textPrimary} />
          </Pressable>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={styles.timeHeaderRow}>
            <View style={[styles.channelHeaderCell, { width: CHANNEL_COL }]}>
              <Text style={styles.channelHeaderText}>Channel</Text>
            </View>
            <View style={{ width: timelineWidth, flexDirection: "row" }}>
              {ticks.map((tick) => (
                <View key={tick.ms} style={styles.tickCell}>
                  <Text style={styles.tickLabel}>{tick.label}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={{ position: "relative" }}>
            {nowOffset >= 0 && nowOffset <= timelineWidth ? (
              <View style={[styles.nowLine, { left: CHANNEL_COL + nowOffset }]} />
            ) : null}

            {channels.map((channel, index) => {
              const programs = queries[index]?.data ?? [];
              const channelThumb = channel.thumbnails.wide || channel.thumbnails.portrait || channel.thumbnails.banner;

              return (
                <Pressable key={channel.id} style={styles.row} onPress={() => onOpenChannel(channel.id)}>
                  <View style={[styles.channelCell, { width: CHANNEL_COL }]}>
                    {channelThumb ? <View style={styles.logoDotWrap}><Text style={styles.logoMark}>TV</Text></View> : <View style={styles.logoDotWrap}><Text style={styles.logoMark}>TV</Text></View>}
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={styles.channelTitle}>{channel.title}</Text>
                      {channel.is_live ? <Text style={styles.liveText}>LIVE</Text> : null}
                    </View>
                  </View>

                  <View style={[styles.timelineCell, { width: timelineWidth }]}>
                    {programs.length ? (
                      programs.map((program) => (
                        <ProgramPill
                          key={`${program.id}-${program.start_time}`}
                          program={program}
                          windowStartMs={windowStartMs}
                          windowEndMs={windowEndMs}
                          nowMs={nowMs}
                        />
                      ))
                    ) : (
                      <Text style={styles.noScheduleText}>No schedule available</Text>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 18,
    marginBottom: 22,
  },
  headerRow: {
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: "800",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  nowBtn: {
    minHeight: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  nowBtnText: {
    color: colors.textPrimary,
    fontWeight: "700",
    fontSize: 12,
  },
  timeHeaderRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  channelHeaderCell: {
    borderRightWidth: 1,
    borderColor: colors.border,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  channelHeaderText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
  },
  tickCell: {
    width: 30 * MIN_PX,
    borderRightWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  tickLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "600",
  },
  nowLine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: "#ff3b30",
    zIndex: 30,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 62,
  },
  channelCell: {
    borderRightWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 8,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  logoDotWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  logoMark: {
    color: colors.textPrimary,
    fontSize: 9,
    fontWeight: "800",
  },
  channelTitle: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  liveText: {
    marginTop: 2,
    color: "#ff6b6b",
    fontSize: 10,
    fontWeight: "800",
  },
  timelineCell: {
    position: "relative",
    minHeight: 62,
  },
  noScheduleText: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 22,
    marginLeft: 8,
  },
  pill: {
    position: "absolute",
    top: 7,
    bottom: 7,
    borderRadius: 7,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 7,
    overflow: "hidden",
  },
  pillDefault: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.14)",
  },
  pillCurrent: {
    backgroundColor: "rgba(230,180,80,0.16)",
    borderColor: "rgba(230,180,80,0.55)",
  },
  pillProgress: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(230,180,80,0.25)",
  },
  pillText: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: "700",
  },
  pillTextCurrent: {
    color: "#f2d38c",
  },
});
