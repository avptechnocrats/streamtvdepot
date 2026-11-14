import { useQuery } from "@tanstack/react-query";
import { FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { BackTitleHeader } from "@/components/common/BackTitleHeader";
import { Screen } from "@/components/common/Screen";
import { RootStackParamList } from "@/navigation/types";
import { fetchPpvEvents, PpvEvent } from "@/services/ppvService";
import { colors } from "@/theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "PpvEvents">;

function PpvCard({ event, onPress }: { event: PpvEvent; onPress: () => void }) {
  const image = event.thumbnails.portrait || event.thumbnails.wide || event.thumbnails.banner;

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.posterWrap}>
        {image ? <Image source={{ uri: image }} style={styles.poster} resizeMode="cover" /> : <View style={styles.posterFallback} />}
        <View style={[styles.badge, event.is_live ? styles.liveBadge : styles.ppvBadge]}>
          <MaterialCommunityIcons name={event.is_live ? "radio" : "ticket-outline"} size={12} color={event.is_live ? "#fff" : "#17120a"} />
          <Text style={[styles.badgeText, !event.is_live && styles.ppvBadgeText]}>{event.is_live ? "LIVE" : "PPV"}</Text>
        </View>
      </View>
      <Text numberOfLines={1} style={styles.title}>{event.title}</Text>
      <Text numberOfLines={1} style={styles.category}>{event.category || "Pay-per-view event"}</Text>
    </Pressable>
  );
}

export function PpvEventsScreen({ navigation }: Props) {
  const { data: events = [], isLoading } = useQuery({
    queryKey: ["ppv-events"],
    queryFn: fetchPpvEvents,
    staleTime: 60_000,
  });

  return (
    <Screen>
      <BackTitleHeader title="PPV Events" subtitle="Exclusive live events with one-time access" onBack={() => navigation.goBack()} />
      {isLoading ? <Text style={styles.status}>Loading events...</Text> : null}
      {!isLoading && !events.length ? (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="ticket-outline" size={38} color={colors.textSecondary} />
          <Text style={styles.emptyTitle}>No PPV events available</Text>
          <Text style={styles.emptyText}>Check back soon for the next exclusive live event.</Text>
        </View>
      ) : (
        <FlatList
          data={events}
          numColumns={2}
          keyExtractor={(event) => event.id}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <PpvCard event={item} onPress={() => navigation.navigate("PpvEventDetails", { eventId: item.id })} />}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingTop: 16, paddingBottom: 24 },
  row: { gap: 12, marginBottom: 18 },
  card: { flex: 1, minWidth: 0 },
  posterWrap: { aspectRatio: 2 / 3, borderRadius: 12, overflow: "hidden", backgroundColor: colors.surfaceMuted },
  poster: { width: "100%", height: "100%" },
  posterFallback: { flex: 1, backgroundColor: colors.surfaceMuted },
  badge: { position: "absolute", top: 8, left: 8, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 4, flexDirection: "row", alignItems: "center", gap: 4 },
  liveBadge: { backgroundColor: "#dc2626" },
  ppvBadge: { backgroundColor: "#f59e0b" },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  ppvBadgeText: { color: "#17120a" },
  title: { marginTop: 8, color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  category: { marginTop: 3, color: colors.textSecondary, fontSize: 12 },
  status: { marginTop: 20, color: colors.textSecondary, textAlign: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, gap: 8 },
  emptyTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: "800" },
  emptyText: { color: colors.textSecondary, textAlign: "center" },
});
