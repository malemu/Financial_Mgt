import { useCallback, useEffect, useState } from "react";
import type { NetWorthPoint } from "@/lib/types";

export type NetWorthHistoryStatus = "idle" | "loading" | "ready" | "error";

const sortHistory = (items: NetWorthPoint[]) =>
  [...items].sort((a, b) => a.date.localeCompare(b.date));

export const useNetWorthHistoryState = (fallback: NetWorthPoint[]) => {
  const [history, setHistory] = useState<NetWorthPoint[]>(sortHistory(fallback));
  const [status, setStatus] = useState<NetWorthHistoryStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  const syncFromServer = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await fetch("/api/net-worth-history", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`History fetch failed (${response.status})`);
      }
      const payload = (await response.json()) as { items?: NetWorthPoint[] };
      setHistory(sortHistory(payload.items ?? []));
      setStatus("ready");
      setError(null);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Unknown net worth error");
    }
  }, []);

  useEffect(() => {
    void syncFromServer();
  }, [syncFromServer]);

  const upsertLocal = useCallback((point: NetWorthPoint) => {
    setHistory((prev) => {
      const next = prev.filter((item) => item.date !== point.date);
      next.push(point);
      return sortHistory(next);
    });
  }, []);

  const removeLocal = useCallback((date?: string | null) => {
    setHistory((prev) => {
      if (!prev.length) return prev;
      if (date) {
        return prev.filter((item) => item.date !== date);
      }
      const next = [...prev];
      next.pop();
      return next;
    });
  }, []);

  const appendPoint = useCallback(
    async (point: NetWorthPoint) => {
      upsertLocal(point);
      setStatus("loading");
      try {
        const response = await fetch("/api/net-worth-history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(point),
        });
        if (!response.ok) {
          throw new Error(`Snapshot save failed (${response.status})`);
        }
        const payload = (await response.json()) as { items?: NetWorthPoint[] };
        if (payload.items) {
          setHistory(sortHistory(payload.items));
        }
        setStatus("ready");
        setError(null);
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Unknown net worth error");
        void syncFromServer();
      }
    },
    [syncFromServer, upsertLocal]
  );

  const deletePoint = useCallback(
    async (date?: string) => {
      removeLocal(date ?? null);
      setStatus("loading");
      try {
        const response = await fetch(
          date ? `/api/net-worth-history?date=${encodeURIComponent(date)}` : "/api/net-worth-history",
          {
            method: "DELETE",
          }
        );
        if (!response.ok) {
          throw new Error(`Snapshot delete failed (${response.status})`);
        }
        const payload = (await response.json()) as {
          history?: NetWorthPoint[];
        };
        if (payload.history) {
          setHistory(sortHistory(payload.history));
        }
        setStatus("ready");
        setError(null);
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Unknown net worth error");
        void syncFromServer();
      }
    },
    [removeLocal, syncFromServer]
  );

  return {
    netWorthHistory: history,
    status,
    error,
    refresh: syncFromServer,
    appendPoint,
    deletePoint,
  };
};
