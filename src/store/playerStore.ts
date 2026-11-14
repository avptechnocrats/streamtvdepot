import { create } from "zustand";

interface PlayerState {
  lastPlayedContentId: string | null;
  lastPositionSecondsByContentId: Record<string, number>;
  setLastPlayed: (id: string) => void;
  setLastPositionSeconds: (id: string, seconds: number) => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  lastPlayedContentId: null,
  lastPositionSecondsByContentId: {},
  setLastPlayed: (id) => set({ lastPlayedContentId: id }),
  setLastPositionSeconds: (id, seconds) =>
    set((state) => ({
      lastPositionSecondsByContentId: {
        ...state.lastPositionSecondsByContentId,
        [id]: seconds,
      },
    })),
}));
