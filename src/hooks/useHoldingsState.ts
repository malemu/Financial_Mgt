import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Holding } from "@/lib/types";

export type HoldingsStatus = "idle" | "loading" | "ready" | "error";

let holdingsSeeded = false;

const buildNewHolding = (): Holding => ({
  asset_id: "NEW",
  shares: 0,
  entry_price: 0,
  cost_basis: 0,
});

export const useHoldingsState = (fallback: Holding[]) => {
  const [holdings, setHoldings] = useState<Holding[]>(fallback);
  const [status, setStatus] = useState<HoldingsStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const seededRef = useRef(false);

  const refresh = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await fetch("/api/holdings", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Holdings fetch failed (${response.status})`);
      }
      const payload = (await response.json()) as { items?: Holding[] };
      if (payload.items && payload.items.length > 0) {
        setHoldings(payload.items);
        seededRef.current = true;
        holdingsSeeded = true;
      } else if (fallback.length && !seededRef.current && !holdingsSeeded) {
        seededRef.current = true;
        holdingsSeeded = true;
        const clone = fallback.map((item) => ({ ...item }));
        setHoldings(clone);
        await Promise.all(
          clone.map((holding) =>
            fetch("/api/holdings", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(holding),
            })
          )
        );
      } else {
        setHoldings([]);
      }
      setStatus("ready");
      setError(null);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Unknown holdings error");
    }
  }, [fallback]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const optimisticUpdate = useCallback(
    (updater: (prev: Holding[]) => Holding[]) => {
      setHoldings((prev) => updater(prev));
    },
    []
  );

  const handleError = useCallback(
    (err: unknown) => {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Unknown holdings error");
      void refresh();
    },
    [refresh]
  );

  const upsertRemote = useCallback(async (payload: Record<string, unknown>) => {
    const response = await fetch("/api/holdings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`Holdings save failed (${response.status})`);
    }
    const data = (await response.json()) as { items?: Holding[] };
    if (data.items) {
      setHoldings(data.items);
    }
    setStatus("ready");
    setError(null);
  }, []);

  const updateHolding = useCallback(
    async (assetId: string, patch: Partial<Holding>) => {
      const previous = holdings.find((holding) => holding.asset_id === assetId);
      if (!previous) return;
      const next = { ...previous, ...patch };
      optimisticUpdate((prev) =>
        prev.map((holding) => (holding.asset_id === assetId ? next : holding))
      );
      try {
        await upsertRemote({ ...next, previous_asset_id: assetId });
      } catch (err) {
        handleError(err);
      }
    },
    [handleError, holdings, optimisticUpdate, upsertRemote]
  );

  const addHolding = useCallback(async () => {
    const holding = buildNewHolding();
    optimisticUpdate((prev) => [...prev, holding]);
    try {
      await upsertRemote(holding);
    } catch (err) {
      handleError(err);
    }
    return holding;
  }, [handleError, optimisticUpdate, upsertRemote]);

  const removeHolding = useCallback(
    async (assetId: string) => {
      const response = await fetch(`/api/holdings?asset_id=${encodeURIComponent(assetId)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        handleError(new Error(`Holdings delete failed (${response.status})`));
        return;
      }
      const payload = (await response.json()) as { items?: Holding[] };
      if (payload.items) {
        setHoldings(payload.items);
      } else {
        optimisticUpdate((prev) => prev.filter((holding) => holding.asset_id !== assetId));
      }
      setStatus("ready");
      setError(null);
    },
    [handleError, optimisticUpdate]
  );

  const memoHoldings = useMemo(() => holdings, [holdings]);

  return {
    holdings: memoHoldings,
    status,
    error,
    refresh,
    updateHolding,
    addHolding,
    removeHolding,
  } as const;
};
