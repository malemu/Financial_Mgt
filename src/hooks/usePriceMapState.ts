import { useCallback, useEffect, useMemo, useState } from "react";
import type { PriceMap } from "@/lib/types";

export type PriceMapStatus = "idle" | "loading" | "ready" | "error";

export const usePriceMapState = (fallback: PriceMap) => {
  const [priceMap, setPriceMap] = useState<PriceMap>(fallback);
  const [status, setStatus] = useState<PriceMapStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await fetch("/api/prices", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Price fetch failed (${response.status})`);
      }
      const payload = (await response.json()) as { prices?: PriceMap };
      if (payload.prices) {
        setPriceMap(payload.prices);
      } else {
        setPriceMap(fallback);
      }
      setStatus("ready");
      setError(null);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Unknown price error");
    }
  }, [fallback]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleError = useCallback(
    (err: unknown) => {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Unknown price error");
      void refresh();
    },
    [refresh]
  );

  const setRemotePrice = useCallback(async (assetId: string, price: number) => {
    const response = await fetch("/api/prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset_id: assetId, price }),
    });
    if (!response.ok) {
      throw new Error(`Price save failed (${response.status})`);
    }
    const payload = (await response.json()) as { prices?: PriceMap };
    if (payload.prices) {
      setPriceMap(payload.prices);
    }
    setStatus("ready");
    setError(null);
  }, []);

  const setPrice = useCallback(
    async (assetId: string, price: number) => {
      setPriceMap((prev) => ({ ...prev, [assetId]: price }));
      try {
        await setRemotePrice(assetId, price);
      } catch (err) {
        handleError(err);
      }
    },
    [handleError, setRemotePrice]
  );

  const ensurePrice = useCallback(
    async (assetId: string, price = 0) => {
      if (priceMap[assetId] !== undefined) return;
      setPriceMap((prev) => ({ ...prev, [assetId]: price }));
      try {
        await fetch("/api/prices", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ asset_id: assetId, price, ensure: true }),
        });
        setStatus("ready");
        setError(null);
      } catch (err) {
        handleError(err);
      }
    },
    [handleError, priceMap]
  );

  const renameAsset = useCallback(
    async (fromAssetId: string, toAssetId: string) => {
      setPriceMap((prev) => {
        const next = { ...prev };
        next[toAssetId] = prev[fromAssetId] ?? 0;
        delete next[fromAssetId];
        return next;
      });
      try {
        const response = await fetch("/api/prices", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from: fromAssetId, to: toAssetId }),
        });
        if (!response.ok) {
          throw new Error(`Price rename failed (${response.status})`);
        }
        const payload = (await response.json()) as { prices?: PriceMap };
        if (payload.prices) {
          setPriceMap(payload.prices);
        }
        setStatus("ready");
        setError(null);
      } catch (err) {
        handleError(err);
      }
    },
    [handleError]
  );

  const removeAsset = useCallback(
    async (assetId: string) => {
      setPriceMap((prev) => {
        const next = { ...prev };
        delete next[assetId];
        return next;
      });
      try {
        const response = await fetch(`/api/prices?asset_id=${encodeURIComponent(assetId)}`, {
          method: "DELETE",
        });
        if (!response.ok) {
          throw new Error(`Price delete failed (${response.status})`);
        }
        const payload = (await response.json()) as { prices?: PriceMap };
        if (payload.prices) {
          setPriceMap(payload.prices);
        }
        setStatus("ready");
        setError(null);
      } catch (err) {
        handleError(err);
      }
    },
    [handleError]
  );

  const memoPriceMap = useMemo(() => priceMap, [priceMap]);

  return {
    priceMap: memoPriceMap,
    status,
    error,
    refresh,
    setPrice,
    ensurePrice,
    renameAsset,
    removeAsset,
  } as const;
};
