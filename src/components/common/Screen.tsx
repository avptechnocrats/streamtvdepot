import { createContext, PropsWithChildren, useCallback, useRef } from "react";
import { NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import LinearGradient from "react-native-linear-gradient";
import { colors } from "@/theme/colors";

type ScreenScrollListener = (scrollY: number) => void;
type SubscribeToScreenScroll = (listener: ScreenScrollListener) => () => void;

export const ScreenScrollContext = createContext<SubscribeToScreenScroll>(() => () => undefined);

interface ScreenProps extends PropsWithChildren {
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}

export function Screen({ children, scroll = true, contentStyle }: ScreenProps) {
  const scrollListeners = useRef(new Set<ScreenScrollListener>());
  const subscribeToScroll = useCallback<SubscribeToScreenScroll>((listener) => {
    scrollListeners.current.add(listener);
    return () => scrollListeners.current.delete(listener);
  }, []);
  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const scrollY = event.nativeEvent.contentOffset.y;
    scrollListeners.current.forEach((listener) => listener(scrollY));
  }, []);

  const content = scroll ? (
    <ScrollView contentContainerStyle={[styles.content, contentStyle]} onScroll={handleScroll} scrollEventThrottle={32}>{children}</ScrollView>
  ) : (
    <View style={[styles.content, contentStyle]}>{children}</View>
  );

  return (
    <ScreenScrollContext.Provider value={subscribeToScroll}>
      <LinearGradient colors={[colors.background, colors.backgroundElevated, colors.background]} style={styles.gradient}>
        <SafeAreaView edges={["top"]} style={styles.safe}>
          {content}
        </SafeAreaView>
      </LinearGradient>
    </ScreenScrollContext.Provider>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safe: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
});
