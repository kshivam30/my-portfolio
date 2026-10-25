const BASE = import.meta.env.VITE_API_BASE_URL || "/api";
import { getSession, getToken } from "./auth";

const DEMO = {
  total_invested: 1694500,
  total_cur_val: 1902300,
  total_pnl: 207800,
  currency_totals: {
    INR: { total_invested: 1460000, total_cur_val: 1634300, total_pnl: 174300 },
    USD: { total_invested: 2800, total_cur_val: 3200, total_pnl: 400 },
  },
  fx: { rate: 83.75, rate_date: "2025-01-15" },
  brokers: [
    { broker: "Zerodha", snapshot_date: "2025-01-15", total_invested: 760000, total_cur_val: 842000, total_pnl: 82000, kind: "broker", currency: "INR" },
    { broker: "Dhan", snapshot_date: "2025-01-15", total_invested: 435000, total_cur_val: 492300, total_pnl: 57300, kind: "broker", currency: "INR" },
    { broker: "IBKR", snapshot_date: "2025-01-15", total_invested: 2800, total_cur_val: 3200, total_pnl: 400, kind: "broker", currency: "USD" },
    { broker: "EPF", snapshot_date: "2025-01-15", total_invested: 265000, total_cur_val: 300000, total_pnl: 35000, kind: "epf", currency: "INR" },
  ],
  holdings: [
    { id: "demo-1", broker: "Zerodha", instrument: "NIFTYBEES", asset_class: "ETF", qty: 420, avg_cost: 228, ltp: 254, invested: 95760, cur_val: 106680, cur_val_inr: 106680, invested_inr: 95760, pnl: 10920, pnl_inr: 10920, net_chg_pct: 11.4, day_chg_pct: 0.8, currency: "INR" },
    { id: "demo-2", broker: "Zerodha", instrument: "HDFCBANK", asset_class: "Equity", qty: 90, avg_cost: 1460, ltp: 1685, invested: 131400, cur_val: 151650, cur_val_inr: 151650, invested_inr: 131400, pnl: 20250, pnl_inr: 20250, net_chg_pct: 15.4, day_chg_pct: -0.3, currency: "INR" },
    { id: "demo-3", broker: "Dhan", instrument: "GOLDBEES", asset_class: "Commodity", qty: 310, avg_cost: 52, ltp: 61, invested: 16120, cur_val: 18910, cur_val_inr: 18910, invested_inr: 16120, pnl: 2790, pnl_inr: 2790, net_chg_pct: 17.3, day_chg_pct: 0.2, currency: "INR" },
    { id: "demo-4", broker: "Zerodha", instrument: "INFY", asset_class: "Equity", qty: 470, avg_cost: 1133.70, ltp: 1241, invested: 532839, cur_val: 583270, cur_val_inr: 583270, invested_inr: 532839, pnl: 50431, pnl_inr: 50431, net_chg_pct: 9.5, day_chg_pct: 0.5, currency: "INR" },
    { id: "demo-5", broker: "Dhan", instrument: "TATAMOTORS", asset_class: "Equity", qty: 200, avg_cost: 2094.40, ltp: 2367, invested: 418880, cur_val: 473400, cur_val_inr: 473400, invested_inr: 418880, pnl: 54520, pnl_inr: 54520, net_chg_pct: 13, day_chg_pct: -0.2, currency: "INR" },
    { id: "demo-6", broker: "IBKR", instrument: "VTI", asset_class: "ETF", qty: 8, avg_cost: 250, ltp: 285, invested: 2000, cur_val: 3200, cur_val_inr: 268000, invested_inr: 234500, pnl: 400, pnl_inr: 33500, net_chg_pct: 14, day_chg_pct: 0.4, currency: "USD" },
    { id: "demo-7", broker: "EPF", instrument: "EPF · 123456", asset_class: "EPF", qty: 1, avg_cost: 265000, ltp: 300000, invested: 265000, cur_val: 300000, cur_val_inr: 300000, invested_inr: 265000, pnl: 35000, pnl_inr: 35000, net_chg_pct: 13.2, day_chg_pct: null, currency: "INR" },
  ],
};

const demoEpfLedger = [
  { id: 1, account_id: 1, member_id: "DEMO••••456", financial_year: "2024-25", entry_kind: "contribution", natural_key: "DEMO-2024-12", wage_month: "2024-12", due_month: "2025-01", txn_date: "2025-01-15", txn_type: "Contribution", employee: 12500, employer: 3675, pension: 8825, wages_epf: 15000, wages_eps: 15000, particulars: "Monthly contribution · sample", source_file: "sample-data.pdf", updated_at: "2025-01-15", created_at: "2025-01-15" },
  { id: 2, account_id: 1, member_id: "DEMO••••456", financial_year: "2024-25", entry_kind: "interest", natural_key: "DEMO-2024-11", wage_month: "2024-11", due_month: "2024-12", txn_date: "2024-12-31", txn_type: "Interest", employee: 0, employer: 0, pension: 0, wages_epf: 0, wages_eps: 0, particulars: "Interest credit · sample", source_file: "sample-data.pdf", updated_at: "2024-12-31", created_at: "2024-12-31" },
];

async function request(path, options = {}) {
  const token = getToken();
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { ...(options.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  return response;
}

const isGuest = () => getSession()?.guest;

export async function getParsers() {
  if (isGuest()) return ["Zerodha", "Dhan", "IBKR", "EPF"].map((name) => ({ name, parser: name, kind: name === "EPF" ? "epf" : "broker", accept: name === "EPF" ? ".pdf" : ".csv" }));
  const res = await request("/parsers");
  if (!res.ok) throw new Error("Failed to load brokers");
  return res.json();
}

export async function getSnapshots() {
  if (isGuest()) return DEMO.brokers.map((broker, index) => ({ id: index + 1, ...broker, source_file: "sample-data.csv" }));
  const res = await request("/snapshots");
  if (!res.ok) return [];
  return res.json();
}

export async function getCumulative() {
  if (isGuest()) return DEMO;
  const res = await request("/cumulative/latest");
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load cumulative data");
  return res.json();
}

export async function getEpfSummary() {
  if (isGuest()) return { total_balance: 300000, total_invested: 265000, total_pnl: 35000, accounts: [{ member_id: "DEMO••••456", balance: 300000, invested: 265000, pnl: 35000, as_of: "2025-01-15" }] };
  const res = await request("/epf/summary");
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load EPF data");
  return res.json();
}

export async function getEpfLedger(memberId = null) {
  if (isGuest()) return { ledger: demoEpfLedger };
  const params = new URLSearchParams();
  if (memberId) params.set("member_id", memberId);
  const res = await request(`/epf/ledger?${params}`);
  if (res.status === 404) return { ledger: [] };
  if (!res.ok) throw new Error("Failed to load EPF ledger");
  return res.json();
}

export async function getIbkrOverview() {
  if (isGuest()) return { snapshot: { snapshot_date: "2025-01-15", source_file: "sample-activity.csv" }, holdings: DEMO.holdings.filter((h) => h.broker === "IBKR"), fx: { rate: 83.75, rate_date: "2025-01-15" }, totals: { total_invested: 2800, total_cur_val: 3200, total_pnl: 400, total_cur_val_inr: 268000 } };
  const res = await request("/ibkr");
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load IBKR portfolio");
  return res.json();
}

export async function uploadHoldings(broker, snapshotDate, file) {
  if (isGuest()) throw new Error("Uploads are available after signing in.");
  const form = new FormData();
  form.append("broker", broker);
  form.append("snapshot_date", snapshotDate);
  form.append("file", file);

  const res = await request("/upload", {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Upload failed");
  }
  return res.json();
}
