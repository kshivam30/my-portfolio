import { formatMoney, formatPct, formatDate, pnlTone } from "../lib/format";

export default function BrokerSources({ brokers }) {
  return (
    <section className="animate-fade-up" style={{ animationDelay: "0.18s" }}>
      <div className="flex items-end justify-between gap-4 mb-4">
        <div>
          <h2 className="font-display text-xl text-ink-950">Sources</h2>
          <p className="text-sm text-ink-400 mt-0.5">Uploaded snapshots power the dashboard</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {(brokers || []).map((b) => {
          const currency = b.currency || "INR";
          const pct = b.total_invested ? (b.total_pnl / b.total_invested) * 100 : 0;
          return (
            <div
              key={b.broker}
              className="rounded-[1.25rem] border border-ink-100/80 bg-white/70 backdrop-blur-sm shadow-soft p-5"
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-sm font-semibold text-ink-900">{b.broker}</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-celadon-600 bg-celadon-50 px-2 py-0.5 rounded-md">
                  {currency === "USD" ? "US · USD" : "India · INR"}
                </span>
              </div>
              <p className="font-display text-2xl text-ink-950 tabular leading-none">
                {formatMoney(b.total_cur_val, currency)}
              </p>
              <p className={`mt-2 text-sm font-semibold tabular ${pnlTone(b.total_pnl)}`}>
                {formatPct(pct)} · {b.total_pnl >= 0 ? "+" : "−"}
                {formatMoney(Math.abs(b.total_pnl || 0), currency)}
              </p>
              <p className="mt-3 text-xs text-ink-400">Updated {formatDate(b.snapshot_date)}</p>
            </div>
          );
        })}

      </div>
    </section>
  );
}
