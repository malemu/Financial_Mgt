import { MarketRegimeSummary } from "@/lib/types";

type Props = {
  summary: MarketRegimeSummary | null;
  fallbackMessage?: string;
};

const formatPercent = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;

const regimeClass = (regime: MarketRegimeSummary["regime"]) => {
  if (regime === "Bull") {
    return "border-[color:var(--success)] bg-[rgba(15,107,93,0.08)] text-[color:var(--success)]";
  }
  if (regime === "Bear") {
    return "border-[color:var(--danger)] bg-[rgba(179,59,46,0.08)] text-[color:var(--danger)]";
  }
  return "border-[color:var(--accent-2)] bg-[rgba(208,129,58,0.08)] text-[color:var(--accent-2)]";
};

export default function MarketStatusPanel({
  summary,
  fallbackMessage = "Market data unavailable",
}: Props) {
  if (!summary) {
    return (
      <section className="rounded-2xl border border-[color:var(--line)] bg-white/80 px-4 py-3 text-sm text-[color:var(--muted)]">
        {fallbackMessage}
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-[color:var(--line)] bg-white/80 px-4 py-3 text-xs text-[color:var(--muted)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[10px] uppercase tracking-[0.2em]">Current Regime</span>
        <span
          className={`rounded-full border px-4 py-1.5 text-sm font-semibold uppercase tracking-[0.2em] ${regimeClass(summary.regime)}`}
        >
          {summary.regime}
        </span>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--panel)] px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.2em]">SPY vs 200DMA</div>
          <div className="mt-1 text-sm font-semibold text-[color:var(--ink)]">
            {formatPercent(summary.sp500Vs200Pct)}
          </div>
        </div>
        <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--panel)] px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.2em]">QQQ vs 200DMA</div>
          <div className="mt-1 text-sm font-semibold text-[color:var(--ink)]">
            {formatPercent(summary.ndxVs200Pct)}
          </div>
        </div>
        <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--panel)] px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.2em]">VIX</div>
          <div className="mt-1 text-sm font-semibold text-[color:var(--ink)]">
            {summary.vixLevel.toFixed(1)}
          </div>
        </div>
        <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--panel)] px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.2em]">Drawdown</div>
          <div className="mt-1 text-sm font-semibold text-[color:var(--ink)]">
            {summary.drawdownFromATH.toFixed(1)}%
          </div>
        </div>
      </div>
    </section>
  );
}
