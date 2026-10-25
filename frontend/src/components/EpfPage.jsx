import { useEffect, useMemo, useState } from "react";
import { getEpfLedger, getEpfSummary } from "../api";

const money = (value) => value == null ? "—" : new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 0,
}).format(value);

export default function EpfPage({ onUpload, refreshKey = 0 }) {
  const [summary, setSummary] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState("all");

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([getEpfSummary(), getEpfLedger()])
      .then(([nextSummary, nextLedger]) => {
        if (!active) return;
        setSummary(nextSummary);
        setLedger(nextLedger?.ledger || []);
        setError(null);
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [refreshKey]);

  const members = [...new Set(ledger.map((row) => row.member_id))];
  const visibleRows = useMemo(() => ledger.filter((row) => member === "all" || row.member_id === member), [ledger, member]);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-celadon-700">Retirement ledger</p>
          <h1 className="font-display text-3xl sm:text-4xl tracking-tight text-ink-950 mt-2">EPF account</h1>
          <p className="text-sm text-ink-500 mt-2">Passbook entries from every uploaded statement, merged by contribution month. Future dated closing rows stay visible here but are excluded from the current balance.</p>
        </div>
        <button onClick={onUpload} className="rounded-xl bg-ink-900 hover:bg-ink-800 text-white text-sm font-semibold px-4 py-2.5">Upload passbook</button>
      </div>

      {error && <div className="rounded-2xl border border-coral-100 bg-coral-50 px-4 py-3 text-sm text-coral-700">{error}</div>}
      {loading ? <div className="rounded-2xl bg-white p-8 text-sm text-ink-400">Loading EPF records…</div> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Current balance", summary?.total_balance],
              ["Contributed principal", summary?.total_invested],
              ["Gain over principal", summary?.total_pnl],
              ["Ledger entries", ledger.length],
            ].map(([label, value]) => <div key={label} className="rounded-2xl border border-ink-100 bg-white p-5 shadow-card">
              <p className="text-xs font-medium text-ink-400">{label}</p>
              <p className="font-display text-2xl text-ink-950 mt-2">{label === "Ledger entries" ? value : money(value)}</p>
            </div>)}
          </div>

          <div className="rounded-2xl border border-ink-100 bg-white shadow-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-4">
              <div>
                <h2 className="font-display text-xl text-ink-950">Stored passbook entries</h2>
                <p className="text-xs text-ink-400 mt-1">One row per opening, contribution month, interest credit, or closing balance.</p>
              </div>
              {members.length > 1 && <select value={member} onChange={(e) => setMember(e.target.value)} className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm">
                <option value="all">All members</option>{members.map((id) => <option key={id} value={id}>{id}</option>)}
              </select>}
            </div>
            {visibleRows.length ? <div className="overflow-x-auto">
              <table className="min-w-[1900px] w-full text-left text-xs">
                <thead className="bg-mist-50 text-ink-500"><tr>
                  {["ID", "Account", "Member", "FY", "Entry", "Natural key", "Wage month", "Due month", "Date", "Txn type", "Employee", "Employer", "Pension", "EPF wages", "EPS wages", "Particulars", "Source file", "Updated", "Created"].map((h) => <th key={h} className="px-4 py-3 font-semibold whitespace-nowrap">{h}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-ink-100">
                  {visibleRows.map((row) => <tr key={row.id} className="hover:bg-mist-25">
                    <td className="px-4 py-3 tabular-nums">{row.id}</td>
                    <td className="px-4 py-3 tabular-nums">{row.account_id}</td>
                    <td className="px-4 py-3 font-mono text-ink-600">{row.member_id}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{row.financial_year}</td>
                    <td className="px-4 py-3 capitalize">{row.entry_kind}</td>
                    <td className="px-4 py-3 font-mono text-[11px]">{row.natural_key}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{row.wage_month || "—"}</td>
                    <td className="px-4 py-3">{row.due_month || "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{row.txn_date || "—"}</td>
                    <td className="px-4 py-3">{row.txn_type || "—"}</td>
                    {[row.employee, row.employer, row.pension, row.wages_epf, row.wages_eps].map((v, i) => <td key={i} className="px-4 py-3 text-right tabular-nums whitespace-nowrap">{money(v)}</td>)}
                    <td className="px-4 py-3 max-w-xs truncate" title={row.particulars || ""}>{row.particulars || "—"}</td>
                    <td className="px-4 py-3 text-ink-500">{row.source_file || "—"}</td>
                    <td className="px-4 py-3 text-ink-500 whitespace-nowrap">{row.updated_at || "—"}</td>
                    <td className="px-4 py-3 text-ink-500 whitespace-nowrap">{row.created_at || "—"}</td>
                  </tr>)}
                </tbody>
              </table>
            </div> : <div className="p-8 text-center text-sm text-ink-400">No EPF entries yet. Upload a passbook PDF to start the ledger.</div>}
          </div>
        </>
      )}
    </section>
  );
}
