import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface PlayerState {
  lastPlayedContentId: string | null;
  lastPositionSecondsByContentId: Record<string, number>;
  completedContentIds: Record<string, boolean>;
  setLastPlayed: (id: string) => void;
  setLastPositionSeconds: (id: string, seconds: number) => void;
  setContentCompleted: (id: string, completed: boolean) => void;
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set) => ({
      lastPlayedContentId: null,
      lastPositionSecondsByContentId: {},
      completedContentIds: {},
      setLastPlayed: (id) => set({ lastPlayedContentId: id }),
      setLastPositionSeconds: (id, seconds) =>
        set((state) => ({
          lastPositionSecondsByContentId: {
            ...state.lastPositionSecondsByContentId,
            [id]: seconds,
          },
        })),
      setContentCompleted: (id, completed) =>
        set((state) => ({
          completedContentIds: {
            ...state.completedContentIds,
            [id]: completed,
          },
        })),
    }),
    {
      name: "streamtv-player-state",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        lastPlayedContentId: state.lastPlayedContentId,
        lastPositionSecondsByContentId: state.lastPositionSecondsByContentId,
        completedContentIds: state.completedContentIds,
      }),
    },
  ),
);
