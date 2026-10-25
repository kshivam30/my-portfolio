import { useMemo, useState } from "react";
import { formatMoney, formatPct, formatQty, pnlTone } from "../lib/format";

const COLUMNS = [
  { key: "instrument", label: "Instrument", align: "left" },
  { key: "broker", label: "Broker", align: "left" },
  { key: "asset_class", label: "Class", align: "left" },
  { key: "weight", label: "Portfolio weight", align: "right", numeric: true },
  { key: "currency", label: "Currency", align: "right" },
  { key: "qty", label: "Qty", align: "right", numeric: true },
  { key: "avg_cost", label: "Avg", align: "right", numeric: true },
  { key: "ltp", label: "LTP", align: "right", numeric: true },
  { key: "invested", label: "Invested", align: "right", numeric: true },
  { key: "cur_val", label: "Current", align: "right", numeric: true },
  { key: "pnl", label: "P&L", align: "right", numeric: true },
  { key: "net_chg_pct", label: "Net %", align: "right", numeric: true },
  { key: "day_chg_pct", label: "Day %", align: "right", numeric: true },
];

export default function HoldingsTable({ holdings }) {
  const [query, setQuery] = useState("");
  const [broker, setBroker] = useState("all");
  const [assetClass, setAssetClass] = useState("all");
  const [sortKey, setSortKey] = useState("cur_val");
  const [sortDir, setSortDir] = useState("desc");

  const brokers = useMemo(
    () => [...new Set((holdings || []).map((h) => h.broker))].sort(),
    [holdings],
  );
  const classes = useMemo(
    () => [...new Set((holdings || []).map((h) => h.asset_class))].sort(),
    [holdings],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = [...(holdings || [])];
    if (broker !== "all") rows = rows.filter((h) => h.broker === broker);
    if (assetClass !== "all") rows = rows.filter((h) => h.asset_class === assetClass);
    if (q) {
      rows = rows.filter(
        (h) =>
          h.instrument?.toLowerCase().includes(q) ||
          h.broker?.toLowerCase().includes(q),
      );
    }
    rows.sort((a, b) => {
      const av = a[sortKey] ?? (typeof a[sortKey] === "string" ? "" : -Infinity);
      const bv = b[sortKey] ?? (typeof b[sortKey] === "string" ? "" : -Infinity);
      if (typeof av === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return rows;
  }, [holdings, query, broker, assetClass, sortKey, sortDir]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "instrument" || key === "broker" || key === "asset_class" ? "asc" : "desc");
    }
  }

  return (
    <section className="animate-fade-up" style={{ animationDelay: "0.22s" }}>
      <div className="rounded-[1.5rem] border border-ink-100/80 bg-white/70 backdrop-blur-sm shadow-soft overflow-hidden">
        <div className="px-5 sm:px-6 py-5 border-b border-ink-100/80 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-xl text-ink-950">Holdings</h2>
            <p className="text-sm text-ink-400 mt-0.5">
              {filtered.length} of {(holdings || []).length} instruments
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
            <label className="relative flex-1 lg:w-56">
              <span className="sr-only">Search</span>
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z" />
              </svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search instrument…"
                className="w-full rounded-xl border border-ink-200 bg-white pl-9 pr-3 py-2.5 text-sm outline-none focus:border-celadon-500 focus:ring-2 focus:ring-celadon-500/20"
              />
            </label>
            <select
              value={broker}
              onChange={(e) => setBroker(e.target.value)}
              className="rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-celadon-500"
            >
              <option value="all">All brokers</option>
              {brokers.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            <select
              value={assetClass}
              onChange={(e) => setAssetClass(e.target.value)}
              className="rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-celadon-500"
            >
              <option value="all">All classes</option>
              {classes.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[960px]">
            <thead>
              <tr className="border-b border-ink-100 bg-mist-50/80">
                {COLUMNS.map((col) => (
                  <th key={col.key} className={`px-3 py-3 ${col.align === "right" ? "text-right" : "text-left"}`}>
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-ink-400 hover:text-ink-700"
                    >
                      {col.label}
                      {sortKey === col.key && (
                        <span className="text-celadon-600">{sortDir === "asc" ? "↑" : "↓"}</span>
                      )}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((h) => (
                <tr
                  key={`${h.broker}-${h.id}`}
                  className="border-b border-ink-50 hover:bg-mist-50/70 transition"
                >
                  <td className="px-3 py-3 font-medium text-ink-900 whitespace-nowrap">{h.instrument}</td>
                  <td className="px-3 py-3 text-ink-500">{h.broker}</td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                        h.asset_class === "Mutual Fund"
                          ? "bg-ink-100 text-ink-700"
                          : "bg-celadon-50 text-celadon-700"
                      }`}
                    >
                      {h.asset_class}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right tabular text-ink-600">
                    {formatPct(h.weight, { signed: false, digits: 1 })}
                  </td>
                  <td className="px-3 py-3 text-right text-xs text-ink-500">{h.currency || "INR"}</td>
                  <td className="px-3 py-3 text-right tabular text-ink-600">{formatQty(h.qty)}</td>
                  <td className="px-3 py-3 text-right tabular text-ink-600">{formatMoney(h.avg_cost, h.currency || "INR", { precise: true })}</td>
                  <td className="px-3 py-3 text-right tabular text-ink-600">{formatMoney(h.ltp, h.currency || "INR", { precise: true })}</td>
                  <td className="px-3 py-3 text-right tabular text-ink-600">{formatMoney(h.invested, h.currency || "INR", { precise: true })}</td>
                  <td className="px-3 py-3 text-right tabular font-medium text-ink-900">
                    {formatMoney(h.cur_val, h.currency || "INR", { precise: true })}
                  </td>
                  <td className={`px-3 py-3 text-right tabular font-medium ${pnlTone(h.pnl)}`}>
                    {h.pnl >= 0 ? "+" : "−"}
                    {formatMoney(Math.abs(h.pnl || 0), h.currency || "INR", { precise: true })}
                  </td>
                  <td className={`px-3 py-3 text-right tabular font-medium ${pnlTone(h.net_chg_pct)}`}>
                    {formatPct(h.net_chg_pct)}
                  </td>
                  <td className={`px-3 py-3 text-right tabular font-medium ${h.day_chg_pct == null ? "text-ink-300" : pnlTone(h.day_chg_pct)}`}>
                    {h.day_chg_pct == null ? "—" : formatPct(h.day_chg_pct)}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-3 py-16 text-center text-ink-400">
                    No holdings match your filters.
                  </td>
                </tr>
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="bg-mist-50/90 border-t border-ink-100">
                  <td className="px-3 py-3 font-semibold text-ink-800" colSpan={3}>
                    Visible total
                  </td>
                  <td className="px-3 py-3 text-right tabular font-semibold text-ink-800">
                    {formatPct(filtered.reduce((sum, h) => sum + (h.weight || 0), 0), { signed: false, digits: 1 })}
                  </td>
                  <td />
                  <td colSpan={3} />
                  <td className="px-3 py-3 text-right tabular font-semibold text-ink-800">
                    {formatCurrencyTotals(filtered, "invested")}
                  </td>
                  <td className="px-3 py-3 text-right tabular font-semibold text-ink-800">
                    {formatCurrencyTotals(filtered, "cur_val")}
                  </td>
                  <td className="px-3 py-3 text-right tabular font-semibold text-ink-800">
                    {formatCurrencyTotals(filtered, "pnl", true)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </section>
  );
}

function formatCurrencyTotals(rows, field, signed = false) {
  const totals = rows.reduce((acc, row) => {
    const currency = row.currency || "INR";
    acc[currency] = (acc[currency] || 0) + (row[field] || 0);
    return acc;
  }, {});
  return Object.entries(totals).map(([currency, value]) => `${signed && value > 0 ? "+" : signed && value < 0 ? "−" : ""}${formatMoney(Math.abs(value), currency, { precise: true })}`).join(" · ");
}
