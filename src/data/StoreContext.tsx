import { createContext, createElement, useContext, useMemo, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { getStoreApi, localRepo } from "./local-store";
import type { StoreApi } from "./store";

const StoreContext = createContext<StoreApi | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(
    localRepo.subscribe,
    localRepo.getSnapshot,
    localRepo.getSnapshot,
  );
  const api = useMemo(() => getStoreApi(), [snapshot]);
  return createElement(StoreContext.Provider, { value: api }, children);
}

export function useStore(): StoreApi {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore fuera del StoreProvider");
  return ctx;
}
