import { useCallback, useEffect, useState } from "react";

const buildUrl = (key: string) => `/api/data/${encodeURIComponent(key)}`;

export function useLocalStorageState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(initialValue);

  const persist = useCallback(
    async (nextValue: T) => {
      await fetch(buildUrl(key), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextValue),
      });
    },
    [key]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    const hydrate = async () => {
      try {
        const response = await fetch(buildUrl(key));
        if (response.ok) {
          const payload = (await response.json()) as T;
          if (!cancelled) setValue(payload);
          return;
        }
      } catch {
        // Fall back to migration or defaults.
      }

      const stored = window.localStorage.getItem(key);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as T;
          await persist(parsed);
          window.localStorage.removeItem(key);
          if (!cancelled) setValue(parsed);
          return;
        } catch {
          window.localStorage.removeItem(key);
        }
      }

      await persist(initialValue);
      if (!cancelled) setValue(initialValue);
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [initialValue, key, persist]);

  const setAndPersist = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? (next as (prev: T) => T)(prev) : next;
        void persist(resolved);
        return resolved;
      });
    },
    [persist]
  );

  return [value, setAndPersist] as const;
}
