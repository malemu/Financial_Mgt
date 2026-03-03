import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";

const ROW_CHUNK = 1000;

const getAdminClient = () => createSupabaseAdminClient();

type FetchOptions = {
  ticker: string;
  select: string;
  limit: number;
  start?: string | null;
  end?: string | null;
};

export const fetchLatestPriceHistoryRows = async <T extends { date: string }>(
  options: FetchOptions
): Promise<T[]> => {
  const { ticker, select, limit, start, end } = options;
  const supabase = getAdminClient();
  const rows: T[] = [];
  let page = 0;

  while (rows.length < limit) {
    let query = supabase.from("price_history").select(select).eq("ticker", ticker);
    if (start) {
      query = query.gte("date", start);
    }
    if (end) {
      query = query.lte("date", end);
    }

    const remaining = limit - rows.length;
    const from = page * ROW_CHUNK;
    const to = from + Math.min(ROW_CHUNK, remaining) - 1;
    const { data, error } = await query
      .order("date", { ascending: false })
      .range(from, to);

    if (error) {
      throw new Error(`Failed to load ${ticker} history: ${error.message}`);
    }

    const batch = ((data ?? []) as unknown) as T[];
    rows.push(...batch);
    if (batch.length < Math.min(ROW_CHUNK, remaining)) {
      break;
    }
    page += 1;
  }

  return rows
    .slice(0, limit)
    .sort((a, b) => a.date.localeCompare(b.date));
};
