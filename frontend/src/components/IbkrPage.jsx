import { useEffect, useState } from "react";
import { getIbkrOverview } from "../api";
import { formatDate, formatMoney, formatPct, formatQty, pnlTone } from "../lib/format";

export default function IbkrPage({ refreshKey = 0 }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getIbkrOverview()
      .then((value) => { if (active) { setData(value); setError(null); } })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [refreshKey]);

  if (loading) return <div className="rounded-2xl bg-white p-8 text-sm text-ink-400">Loading IBKR positions…</div>;
  if (error) return <div className="rounded-2xl border border-coral-100 bg-coral-50 px-4 py-3 text-sm text-coral-700">{error}</div>;
  if (!data) return (
    <section className="rounded-[1.5rem] border border-ink-100 bg-white/70 p-8 text-center">
      <h1 className="font-display text-3xl text-ink-950">IBKR portfolio</h1>
      <p className="mt-2 text-sm text-ink-500">No IBKR statement uploaded yet. Upload an Activity Statement CSV to see the account here.</p>
    </section>
  );

  const { snapshot, holdings, fx, totals } = data;
  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-celadon-700">US brokerage · IBKR</p>
          <h1 className="font-display text-3xl sm:text-4xl tracking-tight text-ink-950 mt-2">Account positions</h1>
          <p className="text-sm text-ink-500 mt-2">Statement date {formatDate(snapshot.snapshot_date)} · {snapshot.source_file || "Activity Statement"}</p>
        </div>
        <div className="rounded-xl bg-ink-900 text-white px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-white/60">Market value</p>
          <p className="font-semibold tabular">{formatMoney(totals.total_cur_val, "USD", { precise: true })}</p>
          {totals.total_cur_val_inr == null ? <p className="text-xs text-white/60 mt-1">INR conversion unavailable</p> : <p className="text-xs text-white/70 mt-1">{formatMoney(totals.total_cur_val_inr, "INR")} equivalent</p>}
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metric label="Account NAV" value={formatMoney(totals.total_cur_val, "USD", { precise: true })} />
        <Metric label="Cost basis" value={formatMoney(totals.total_invested, "USD", { precise: true })} />
        <Metric label="Unrealized P&L" value={formatMoney(totals.total_pnl, "USD", { precise: true })} tone={pnlTone(totals.total_pnl)} />
        <Metric label="Positions" value={`${holdings.length}`} />
      </div>

      {fx && <p className="text-xs text-ink-400">USD/INR reference: {fx.rate.toFixed(4)} on {formatDate(fx.rate_date)} · {fx.source}{fx.stale ? " · cached fallback" : ""}. Portfolio totals use this rate; IBKR figures below remain in USD.</p>}
      {holdings.some((h) => h.asset_class === "Unvested Award") && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Unvested awards are shown separately and excluded from the parsed account NAV when IBKR does not include them in Open Positions.</p>}

      <div className="rounded-[1.5rem] border border-ink-100/80 bg-white/70 shadow-soft overflow-hidden">
        <div className="px-5 py-4 border-b border-ink-100"><h2 className="font-display text-xl text-ink-950">Stored positions</h2><p className="text-sm text-ink-400 mt-1">{holdings.length} rows from the latest uploaded statement snapshot</p></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm">
          <thead><tr className="bg-mist-50 text-[10px] uppercase tracking-wider text-ink-400">{["Symbol / description", "Class", "Quantity", "Avg cost", "Last price", "Cost basis", "Market value", "Unrealized P&L", "Return"].map((label) => <th key={label} className="px-4 py-3 text-right first:text-left">{label}</th>)}</tr></thead>
          <tbody>{holdings.map((h) => <tr key={h.id} className="border-t border-ink-50 hover:bg-mist-50/70">
            <td className="px-4 py-3"><p className="font-medium text-ink-900">{h.instrument}</p><p className="text-xs text-ink-400">USD</p></td>
            <td className="px-4 py-3 text-right text-ink-500">{h.asset_class}</td>
            <td className="px-4 py-3 text-right tabular">{formatQty(h.qty)}</td>
            <td className="px-4 py-3 text-right tabular">{formatMoney(h.avg_cost, "USD", { precise: true })}</td>
            <td className="px-4 py-3 text-right tabular">{formatMoney(h.ltp, "USD", { precise: true })}</td>
            <td className="px-4 py-3 text-right tabular">{formatMoney(h.invested, "USD", { precise: true })}</td>
            <td className="px-4 py-3 text-right tabular font-medium">{formatMoney(h.cur_val, "USD", { precise: true })}</td>
            <td className={`px-4 py-3 text-right tabular font-medium ${pnlTone(h.pnl)}`}>{formatMoney(h.pnl, "USD", { precise: true })}</td>
            <td className={`px-4 py-3 text-right tabular ${pnlTone(h.net_chg_pct)}`}>{formatPct(h.net_chg_pct)}</td>
          </tr>)}
          {holdings.length === 0 && <tr><td colSpan={9} className="px-4 py-12 text-center text-ink-400">No position rows in this snapshot.</td></tr>}
          </tbody>
        </table></div>
      </div>
    </section>
  );
}

function Metric({ label, value, tone = "text-ink-900" }) {
  return <div className="rounded-2xl border border-ink-100/70 bg-white/70 px-4 py-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">{label}</p><p className={`mt-1 text-sm sm:text-base font-semibold tabular ${tone}`}>{value}</p></div>;
}
