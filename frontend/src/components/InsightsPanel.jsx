import { formatMoney, formatPct, pnlTone } from "../lib/format";

export default function InsightsPanel({ insights }) {
  return (
    <section
      className="animate-fade-up grid grid-cols-1 lg:grid-cols-3 gap-4"
      style={{ animationDelay: "0.14s" }}
    >
      <ConcentrationCard insights={insights} />
      <MoversCard title="Top gainers" items={insights.winners} empty="No gainers yet" />
      <MoversCard title="Top losers" items={insights.losers} empty="No losers — nice" />
    </section>
  );
}

function ConcentrationCard({ insights }) {
  const top = insights.topHolding;

  return (
    <div className="rounded-[1.5rem] border border-ink-100/80 bg-white/70 backdrop-blur-sm shadow-soft p-6">
      <h2 className="font-display text-xl text-ink-950">Concentration</h2>
      <p className="text-sm text-ink-400 mt-0.5 mb-5">How much sits in a few names</p>

      <div className="space-y-5">
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-ink-500">Top 5 holdings</span>
            <span className="font-semibold tabular text-ink-900">
              {formatPct(insights.top5Weight, { signed: false, digits: 1 })}
            </span>
          </div>
          <div className="h-2 rounded-full bg-ink-100 overflow-hidden">
            <div
              className="bar-fill h-full rounded-full bg-ink-800 animate-grow-x"
              style={{ width: `${Math.min(insights.top5Weight, 100)}%` }}
            />
          </div>
        </div>

        {top && (
          <div className="rounded-2xl bg-mist-50 border border-ink-100 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Largest position</p>
            <p className="mt-1 font-semibold text-ink-900 truncate">{top.instrument}</p>
            <p className="text-sm text-ink-500 tabular mt-0.5">
              {formatMoney(top.cur_val, top.currency || "INR")} · {formatPct(top.weight, { signed: false, digits: 1 })} of portfolio
            </p>
          </div>
        )}

        <p className="text-sm text-ink-500 leading-relaxed">
          Profile: <span className="font-semibold text-ink-800">{insights.diversification}</span>
          {insights.top5Weight > 60 && (
            <span> — more than 60% of value is in five names; consider trimming or averaging.</span>
          )}
        </p>
      </div>
    </div>
  );
}

function MoversCard({ title, items, empty }) {
  return (
    <div className="rounded-[1.5rem] border border-ink-100/80 bg-white/70 backdrop-blur-sm shadow-soft p-6">
      <h2 className="font-display text-xl text-ink-950">{title}</h2>
      <p className="text-sm text-ink-400 mt-0.5 mb-5">By net return %</p>

      {items.length === 0 ? (
        <p className="text-sm text-ink-400 py-6 text-center">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((h) => (
            <li
              key={`${h.broker}-${h.id}`}
              className="flex items-center justify-between gap-3 rounded-xl px-2 py-2.5 hover:bg-mist-50 transition"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-900 truncate">{h.instrument}</p>
                <p className="text-[11px] text-ink-400">
                  {h.broker} · {formatMoney(h.cur_val, h.currency || "INR")}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className={`text-sm font-semibold tabular ${pnlTone(h.net_chg_pct)}`}>
                  {formatPct(h.net_chg_pct)}
                </p>
                <p className={`text-[11px] tabular ${pnlTone(h.pnl)}`}>
                  {h.pnl >= 0 ? "+" : "−"}
                  {formatMoney(Math.abs(h.pnl || 0), h.currency || "INR")}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
