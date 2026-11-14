import { useContext, useEffect, useRef, useState } from "react";
import { FlatList, NativeScrollEvent, NativeSyntheticEvent, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { ContentItem } from "@/types/models";
import { PosterCard } from "@/components/content/PosterCard";
import { ScreenScrollContext } from "@/components/common/Screen";
import { colors } from "@/theme/colors";
import { dedupeContentItems } from "@/utils/contentList";

type RailVariant = "portrait" | "landscape" | "wider-landscape";

const RANK_OUTLINE_OFFSETS = [
  { x: -2, y: 0 },
  { x: 2, y: 0 },
  { x: 0, y: -2 },
  { x: 0, y: 2 },
  { x: -1.5, y: -1.5 },
  { x: 1.5, y: -1.5 },
  { x: -1.5, y: 1.5 },
  { x: 1.5, y: 1.5 },
];

interface ContentRailProps {
  title: string;
  items: ContentItem[];
  onOpen: (item: ContentItem) => void;
  ranked?: boolean;
  variant?: RailVariant;
  previewOnFocus?: boolean;
  previewActive?: boolean;
}

export function ContentRail({ title, items, onOpen, ranked = false, variant = "portrait", previewOnFocus = false, previewActive = true }: ContentRailProps) {
  const uniqueItems = dedupeContentItems(items);
  const [centeredPreviewId, setCenteredPreviewId] = useState<string | null>(null);
  const [railCentered, setRailCentered] = useState(false);
  const itemCenters = useRef(new Map<string, number>());
  const scrollOffset = useRef(0);
  const viewportWidth = useRef(0);
  const railPosition = useRef({ y: 0, height: 0 });
  const screenScrollY = useRef(0);
  const { height: screenHeight } = useWindowDimensions();
  const subscribeToScreenScroll = useContext(ScreenScrollContext);

  useEffect(() => {
    if (!previewOnFocus) return;
    if (!previewActive) setCenteredPreviewId(null);
  }, [previewActive, previewOnFocus]);

  useEffect(() => {
    if (!previewOnFocus) return;
    return subscribeToScreenScroll((scrollY) => {
      screenScrollY.current = scrollY;
      const railCenterY = railPosition.current.y - scrollY + railPosition.current.height / 2;
      setRailCentered(Math.abs(railCenterY - screenHeight / 2) <= screenHeight * 0.2);
    });
  }, [previewOnFocus, screenHeight, subscribeToScreenScroll]);

  if (!uniqueItems.length) return null;

  const updateCenteredItem = (offset: number, width: number) => {
    if (!previewOnFocus) return;
    const center = offset + width / 2;
    let nearestId: string | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    itemCenters.current.forEach((itemCenter, id) => {
      const distance = Math.abs(itemCenter - center);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestId = id;
      }
    });
    setCenteredPreviewId(nearestId);
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!previewOnFocus) return;
    const { contentOffset, layoutMeasurement } = event.nativeEvent;
    scrollOffset.current = contentOffset.x;
    viewportWidth.current = layoutMeasurement.width;
    updateCenteredItem(scrollOffset.current, viewportWidth.current);
  };

  return (
    <View
      style={styles.wrap}
      onLayout={previewOnFocus ? (event) => {
        const { y, height } = event.nativeEvent.layout;
        railPosition.current = { y, height };
        const railCenterY = y - screenScrollY.current + height / 2;
        setRailCentered(Math.abs(railCenterY - screenHeight / 2) <= screenHeight * 0.2);
      } : undefined}
    >
      <Text style={styles.title}>{title}</Text>
      <FlatList
        horizontal
        data={uniqueItems}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => ranked ? (
          <View
            style={styles.rankedItem}
            onLayout={previewOnFocus ? (event) => {
              const { x, width } = event.nativeEvent.layout;
              itemCenters.current.set(item.id, x + width / 2);
              updateCenteredItem(scrollOffset.current, viewportWidth.current);
            } : undefined}
          >
            <View pointerEvents="none" style={styles.rankMark}>
              {RANK_OUTLINE_OFFSETS.map((offset, offsetIndex) => (
                <Text
                  key={offsetIndex}
                  style={[styles.rankNumber, styles.rankOutline, { left: offset.x, top: offset.y }]}
                >
                  {index + 1}
                </Text>
              ))}
              <Text style={[styles.rankNumber, styles.rankFill]}>{index + 1}</Text>
            </View>
            <View style={styles.rankedPoster}>
              <PosterCard item={item} onPress={() => onOpen(item)} variant={variant} previewOnFocus={previewOnFocus} previewActive={previewActive && railCentered && centeredPreviewId === item.id} showTitle={false} />
            </View>
          </View>
        ) : (
          <View
            onLayout={previewOnFocus ? (event) => {
              const { x, width } = event.nativeEvent.layout;
              itemCenters.current.set(item.id, x + width / 2);
              updateCenteredItem(scrollOffset.current, viewportWidth.current);
            } : undefined}
          >
            <PosterCard
              item={item}
              onPress={() => onOpen(item)}
              variant={variant}
              previewOnFocus={previewOnFocus}
              previewActive={previewActive && railCentered && centeredPreviewId === item.id}
            />
          </View>
        )}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={3}
        removeClippedSubviews
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={ranked ? styles.rankedScrollContent : undefined}
        scrollEventThrottle={previewOnFocus ? 32 : undefined}
        onLayout={previewOnFocus ? (event) => {
          viewportWidth.current = event.nativeEvent.layout.width;
          updateCenteredItem(scrollOffset.current, viewportWidth.current);
        } : undefined}
        onScroll={previewOnFocus ? handleScroll : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 20,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 19,
    fontWeight: "800",
    marginBottom: 12,
  },
  rankedItem: {
    position: "relative",
    paddingLeft: 58,
    marginRight: 12,
  },
  rankedPoster: {
    zIndex: 1,
  },
  rankMark: {
    position: "absolute",
    left: -8,
    top: 0,
    zIndex: 0,
    width: 106,
    height: 190,
  },
  rankNumber: {
    position: "absolute",
    width: 106,
    height: "100%",
    fontSize: 126,
    fontWeight: "900",
    lineHeight: 134,
    textAlign: "center",
    textAlignVertical: "center",
    includeFontPadding: false,
  },
  rankOutline: {
    color: "#aeb2bd",
    opacity: 0.48,
  },
  rankFill: {
    color: colors.background,
  },
  rankedScrollContent: {
    paddingLeft: 10,
    paddingTop: 8,
    paddingBottom: 46,
  },
});
