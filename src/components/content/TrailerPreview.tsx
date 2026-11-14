import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, GestureResponderEvent, Pressable, StyleSheet, View } from "react-native";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import Video from "react-native-video";
import type { VideoRef } from "react-native-video";
import { colors } from "@/theme/colors";

interface TrailerPreviewProps {
  source?: string | null;
  active: boolean;
  onEnd?: () => void;
  controlPosition?: "top-right" | "bottom-right";
  videoScale?: number;
  startDelayMs?: number;
}

export function TrailerPreview({ source, active, onEnd, controlPosition = "top-right", videoScale = 1, startDelayMs = 900 }: TrailerPreviewProps) {
  const [muted, setMuted] = useState(true);
  const [buffering, setBuffering] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [delayElapsed, setDelayElapsed] = useState(false);
  const [ended, setEnded] = useState(false);
  const videoRef = useRef<VideoRef | null>(null);

  useEffect(() => {
    setMuted(true);
    setBuffering(false);
    setFailed(false);
    setReady(false);
    setEnded(false);
    setDelayElapsed(false);
    if (!active) {
      videoRef.current?.seek(0);
      return;
    }
    const timer = setTimeout(() => {
      setDelayElapsed(true);
      setBuffering(Boolean(source));
    }, startDelayMs);
    return () => clearTimeout(timer);
  }, [active, source, startDelayMs]);

  if (!source || failed || ended) return null;
  const shouldPlay = active && delayElapsed;

  const toggleAudio = (event: GestureResponderEvent) => {
    event.stopPropagation();
    setMuted((current) => !current);
  };

  return (
    <View pointerEvents="box-none" style={styles.container}>
      <Video
        ref={videoRef}
        source={{ uri: source }}
        style={[
          StyleSheet.absoluteFillObject,
          videoScale !== 1 && { transform: [{ scale: videoScale }] },
          { opacity: shouldPlay && ready && !buffering ? 1 : 0 },
        ]}
        resizeMode="cover"
        paused={!shouldPlay}
        muted={muted}
        repeat={false}
        playInBackground={false}
        playWhenInactive={false}
        onBuffer={({ isBuffering }) => setBuffering(shouldPlay && isBuffering)}
        onReadyForDisplay={() => {
          setReady(true);
          setBuffering(false);
        }}
        onEnd={() => {
          setEnded(true);
          onEnd?.();
        }}
        onError={() => {
          setBuffering(false);
          setFailed(true);
        }}
      />
      {shouldPlay && buffering ? (
        <View pointerEvents="none" style={styles.loading}>
          <ActivityIndicator size="large" color={colors.textPrimary} />
        </View>
      ) : null}
      {shouldPlay ? (
        <Pressable
          style={[styles.audioButton, controlPosition === "bottom-right" ? styles.bottomRight : styles.topRight]}
          onPress={toggleAudio}
          accessibilityRole="button"
          accessibilityLabel={muted ? "Unmute trailer" : "Mute trailer"}
          hitSlop={8}
        >
          <MaterialCommunityIcons
            name={muted ? "volume-off" : "volume-high"}
            size={19}
            color={colors.textPrimary}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  audioButton: {
    position: "absolute",
    right: 10,
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  topRight: { top: 10 },
  bottomRight: { bottom: 10 },
});