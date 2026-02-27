import { useCallback, useEffect, useState } from "react";
import type { GoalConfig } from "@/lib/types";

export type GoalStateStatus = "idle" | "loading" | "ready" | "error";

export const useGoalState = (fallback: GoalConfig) => {
  const [goal, setGoal] = useState<GoalConfig>(fallback);
  const [status, setStatus] = useState<GoalStateStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadGoal = async () => {
      setStatus("loading");
      try {
        const response = await fetch("/api/goals", { cache: "no-store" });
        if (!response.ok) {
          if (response.status === 404) {
            setStatus("ready");
            setError(null);
            return;
          }
          throw new Error(`Goal fetch failed (${response.status})`);
        }
        const data = (await response.json()) as GoalConfig;
        if (!cancelled) {
          setGoal(data);
          setStatus("ready");
          setError(null);
        }
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "Unknown goal error");
      }
    };

    void loadGoal();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistGoal = useCallback(async (nextGoal: GoalConfig) => {
    setGoal(nextGoal);
    setStatus("loading");
    try {
      const response = await fetch("/api/goals", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(nextGoal),
      });
      if (!response.ok) {
        throw new Error(`Goal update failed (${response.status})`);
      }
      setStatus("ready");
      setError(null);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Unknown goal error");
    }
  }, []);

  return { goal, setGoal: persistGoal, status, error };
};
