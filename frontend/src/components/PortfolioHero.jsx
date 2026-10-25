import { formatINR, formatMoney, formatPct, formatDate, pnlTone } from "../lib/format";

export default function PortfolioHero({ insights }) {
  const gain = insights.pnl >= 0;

  return (
    <section className="animate-fade-up relative overflow-hidden rounded-[1.75rem] border border-ink-100/80 bg-white/70 backdrop-blur-sm shadow-soft">
      <div
        className="absolute inset-0 opacity-90"
        style={{
          background:
            "linear-gradient(135deg, rgba(58,115,96,0.08) 0%, transparent 42%, rgba(26,36,32,0.04) 100%)",
        }}
      />
      <div className="absolute -right-16 -top-20 w-72 h-72 rounded-full bg-celadon-400/10 blur-3xl" />
      <div className="absolute -left-10 bottom-0 w-56 h-56 rounded-full bg-ink-900/5 blur-3xl" />

      <div className="relative px-6 sm:px-10 py-8 sm:py-10">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
          <div className="space-y-4 max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-400">
              Total portfolio · INR equivalent
            </p>
            <div>
              <h1 className="font-display text-[2.75rem] sm:text-6xl leading-none tracking-tight text-ink-950 tabular">
                {formatINR(insights.current)}
              </h1>
              <div className={`mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 ${pnlTone(insights.pnl)}`}>
                <span className="font-display text-2xl sm:text-3xl tabular">
                  {insights.pnl >= 0 ? "+" : "−"}
                  {formatINR(Math.abs(insights.pnl))}
                </span>
                <span className="text-base font-semibold tabular">
                  {formatPct(insights.pnlPct)} overall
                </span>
              </div>
            </div>
            <p className="text-sm text-ink-500 leading-relaxed">
              Invested {formatINR(insights.invested)} across {insights.holdingCount} holdings
              {insights.brokerCount ? ` · ${insights.brokerCount} sources` : ""}
              {insights.latestDate ? ` · as of ${formatDate(insights.latestDate)}` : ""}
              {insights.fx?.rate ? ` · USD converted at ₹${insights.fx.rate.toFixed(2)} (${insights.fx.date})` : insights.usdCurrent ? " · USD assets excluded until FX rate is available" : ""}
            </p>
          </div>

          {insights.dayPnl != null && (
            <div className="rounded-2xl border border-ink-100 bg-white/80 px-5 py-4 w-full sm:w-auto lg:min-w-[220px]">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
                Est. day move
              </p>
              <p className={`mt-1 font-display text-2xl tabular ${pnlTone(insights.dayPnl)}`}>
                {insights.dayPnl >= 0 ? "+" : "−"}
                {formatINR(Math.abs(insights.dayPnl))}
                {insights.dayPct != null && (
                  <span className="ml-2 text-sm font-sans font-semibold">
                    {formatPct(insights.dayPct)}
                  </span>
                )}
              </p>
              <p className="mt-1 text-[11px] text-ink-400">
                Based on {insights.dayCoverage} INR instruments
              </p>
            </div>
          )}
        </div>

        <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 stagger">
          <Metric label="Invested" value={formatINR(insights.invested)} />
          <Metric
            label="Unrealized P&L"
            value={`${gain ? "+" : "−"}${formatINR(Math.abs(insights.pnl))}`}
            tone={pnlTone(insights.pnl)}
          />
          <Metric label="Return" value={formatPct(insights.pnlPct)} tone={pnlTone(insights.pnl)} />
          <Metric label="Diversification" value={insights.diversification} />
          <Metric label="US assets · INR equivalent" value={insights.usdCurrentInr == null ? "FX unavailable" : formatINR(insights.usdCurrentInr)} />
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value, tone = "text-ink-900" }) {
  return (
    <div className="animate-fade-up rounded-2xl border border-ink-100/70 bg-white/60 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">{label}</p>
      <p className={`mt-1 text-sm sm:text-base font-semibold tabular ${tone}`}>{value}</p>
    </div>
  );
}
