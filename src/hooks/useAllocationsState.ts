import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Allocation } from "@/lib/types";

export type AllocationsStatus = "idle" | "loading" | "ready" | "error";

let allocationsSeeded = false;

const buildNewAllocation = (): Allocation => {
  const id = `alloc-${Date.now()}`;
  return {
    id,
    asset_id: "NEW",
    asset_type: "stock",
    target_weight: 5,
    max_weight: 10,
    conviction_tier: 3,
    expected_cagr: 15,
    role: "core growth",
    thesis_summary: "Define thesis.",
    kill_criteria: "Define kill criteria.",
    thesis_last_review: new Date().toISOString().slice(0, 10),
    fundamentals_summary: "Add fundamentals summary.",
    price_action: "Add price action context.",
    thesis_valid: true,
  } satisfies Allocation;
};

export const useAllocationsState = (fallback: Allocation[]) => {
  const [allocations, setAllocations] = useState<Allocation[]>(fallback);
  const [status, setStatus] = useState<AllocationsStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const seededRef = useRef(false);

  const saveAllocation = useCallback(async (allocation: Allocation) => {
    const response = await fetch("/api/allocations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(allocation),
    });
    if (!response.ok) {
      throw new Error(`Allocation save failed (${response.status})`);
    }
    const payload = (await response.json()) as { items?: Allocation[] };
    return payload.items;
  }, []);

  const refresh = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await fetch("/api/allocations", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Allocation fetch failed (${response.status})`);
      }
      const payload = (await response.json()) as { items?: Allocation[] };
      if (payload.items && payload.items.length > 0) {
        setAllocations(payload.items);
        seededRef.current = true;
        allocationsSeeded = true;
      } else if (fallback.length && !seededRef.current && !allocationsSeeded) {
        seededRef.current = true;
        allocationsSeeded = true;
        const clone = fallback.map((item) => ({ ...item }));
        setAllocations(clone);
        await Promise.all(clone.map((item) => saveAllocation(item)));
      } else {
        setAllocations([]);
      }
      setStatus("ready");
      setError(null);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Unknown allocation error");
    }
  }, [fallback, saveAllocation]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const optimisticUpdate = useCallback(
    (updater: (prev: Allocation[]) => { list: Allocation[]; changed?: Allocation }) => {
      let changed: Allocation | undefined;
      setAllocations((prev) => {
        const result = updater(prev);
        changed = result.changed;
        return result.list;
      });
      return changed;
    },
    []
  );

  const handleSaveError = useCallback(
    (err: unknown) => {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Unknown allocation error");
      void refresh();
    },
    [refresh]
  );

  const updateAllocation = useCallback(
    (id: string, patch: Partial<Allocation>) => {
      const updated = optimisticUpdate((prev) => {
        let changed: Allocation | undefined;
        const list = prev.map((allocation) => {
          if (allocation.id === id) {
            changed = { ...allocation, ...patch };
            return changed;
          }
          return allocation;
        });
        return { list, changed };
      });
      if (!updated) return;
      void saveAllocation(updated).then(() => {
        setStatus("ready");
        setError(null);
      }).catch(handleSaveError);
    },
    [handleSaveError, optimisticUpdate, saveAllocation]
  );

  const addAllocation = useCallback(() => {
    const allocation = buildNewAllocation();
    optimisticUpdate((prev) => ({ list: [...prev, allocation], changed: allocation }));
    void saveAllocation(allocation)
      .then(() => {
        setStatus("ready");
        setError(null);
      })
      .catch(handleSaveError);
  }, [handleSaveError, optimisticUpdate, saveAllocation]);

  const removeAllocation = useCallback(
    (id: string) => {
      optimisticUpdate((prev) => ({
        list: prev.filter((allocation) => allocation.id !== id),
      }));
      setStatus("loading");
      fetch(`/api/allocations?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Allocation delete failed (${response.status})`);
          }
          setStatus("ready");
          setError(null);
        })
        .catch(handleSaveError);
    },
    [handleSaveError, optimisticUpdate]
  );

  const sortedAllocations = useMemo(() => allocations, [allocations]);

  return {
    allocations: sortedAllocations,
    status,
    error,
    refresh,
    updateAllocation,
    addAllocation,
    removeAllocation,
  } as const;
};
