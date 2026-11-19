import { useEffect, useRef } from "react";
import { NativeModules, Platform } from "react-native";
import Orientation from "react-native-orientation-locker";

const androidFullscreenOrientation = NativeModules.FullscreenOrientation as {
  enter: () => void;
  exit: () => void;
};

export function useFullscreenOrientation() {
  const isFullscreen = useRef(false);

  useEffect(() => () => {
    if (!isFullscreen.current) return;
    if (Platform.OS === "android") androidFullscreenOrientation.exit();
    else Orientation.unlockAllOrientations();
  }, []);

  const onFullscreenPlayerWillPresent = () => {
    isFullscreen.current = true;
    if (Platform.OS === "android") androidFullscreenOrientation.enter();
    else Orientation.lockToLandscape();
  };

  const onFullscreenPlayerDidDismiss = () => {
    if (!isFullscreen.current) return;
    isFullscreen.current = false;
    if (Platform.OS === "android") androidFullscreenOrientation.exit();
    else Orientation.unlockAllOrientations();
  };

  return { onFullscreenPlayerWillPresent, onFullscreenPlayerDidDismiss };
}