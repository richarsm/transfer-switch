import { createContext, createElement, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { bootStore, getStoreApi, localRepo } from "./local-store";
import type { StoreApi } from "./store";

const StoreContext = createContext<StoreApi | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const snapshot = useSyncExternalStore(
    localRepo.subscribe,
    localRepo.getSnapshot,
    localRepo.getSnapshot,
  );
  const api = useMemo(() => getStoreApi(), [snapshot]);

  useEffect(() => {
    bootStore()
      .then(() => setReady(true))
      .catch((err) => {
        setError(err instanceof Error ? err.message : "No se pudo conectar a la base de datos.");
      });
  }, []);

  if (error) {
    return createElement(
      "div",
      { className: "login" },
      createElement(
        "div",
        { className: "login-card" },
        createElement("h1", null, "Sin conexión a datos"),
        createElement("p", null, error),
      ),
    );
  }

  if (!ready) {
    return createElement(
      "div",
      { className: "login" },
      createElement(
        "div",
        { className: "login-card" },
        createElement("h1", null, "Cargando"),
        createElement("p", null, "Leyendo el periodo y las operaciones compartidas…"),
      ),
    );
  }

  return createElement(StoreContext.Provider, { value: api }, children);
}

export function useStore(): StoreApi {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore fuera del StoreProvider");
  return ctx;
}
