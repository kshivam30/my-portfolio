const PALETTE = [
  "#3a7360",
  "#2a3832",
  "#6aad92",
  "#8a9b93",
  "#4a8f76",
  "#5c6b64",
  "#9bb8ab",
];

function sumBy(rows, keyFn, valueFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    map.set(key, (map.get(key) || 0) + (valueFn(row) || 0));
  }
  return map;
}

function toSlices(map, total) {
  return [...map.entries()]
    .map(([label, value], i) => ({
      label,
      value,
      pct: total ? (value / total) * 100 : 0,
      color: PALETTE[i % PALETTE.length],
    }))
    .sort((a, b) => b.value - a.value);
}

export function buildInsights(data) {
  if (!data) return null;

  const currencyTotals = data.currency_totals || {};
  const holdings = (data.holdings || []).map((h) => ({
    ...h,
    weight: data.total_cur_val ? ((h.cur_val_inr || 0) / data.total_cur_val) * 100 : 0,
  }));

  const invested = data.total_invested || 0;
  const current = data.total_cur_val || 0;
  const pnl = data.total_pnl || 0;
  const pnlPct = invested ? (pnl / invested) * 100 : 0;

  const dayPnl = holdings.filter((h) => (h.currency || "INR") === "INR").reduce((s, h) => {
    if (h.day_chg_pct == null || h.cur_val == null) return s;
    const prev = h.cur_val / (1 + h.day_chg_pct / 100);
    return s + (h.cur_val - prev);
  }, 0);
  const dayCoverage = holdings.filter((h) => (h.currency || "INR") === "INR" && h.day_chg_pct != null).length;
  const dayPct = current && dayCoverage ? (dayPnl / (current - dayPnl)) * 100 : null;

  const byClass = toSlices(
    sumBy(holdings, (h) => h.asset_class || "Other", (h) => h.cur_val_inr || 0),
    current,
  );

  const byBroker = toSlices(
    sumBy(holdings, (h) => h.broker || "Unknown", (h) => h.cur_val_inr || 0),
    current,
  );

  const ranked = [...holdings].sort((a, b) => (b.cur_val_inr || 0) - (a.cur_val_inr || 0));
  const top5Weight = ranked.slice(0, 5).reduce((s, h) => s + h.weight, 0);
  const topHolding = ranked[0] || null;

  const hhi = holdings.reduce((s, h) => s + (h.weight / 100) ** 2, 0);
  let diversification = "Concentrated";
  if (hhi < 0.08) diversification = "Well diversified";
  else if (hhi < 0.15) diversification = "Moderately diversified";
  else if (hhi < 0.25) diversification = "Somewhat concentrated";

  const byPct = [...holdings]
    .filter((h) => h.net_chg_pct != null)
    .sort((a, b) => (b.net_chg_pct || 0) - (a.net_chg_pct || 0));

  const byAbs = [...holdings]
    .filter((h) => h.pnl != null)
    .sort((a, b) => (b.pnl || 0) - (a.pnl || 0));

  const winners = byPct.filter((h) => (h.net_chg_pct || 0) > 0).slice(0, 5);
  const losers = byPct.filter((h) => (h.net_chg_pct || 0) < 0).slice(-5).reverse();
  const absWinners = byAbs.filter((h) => (h.pnl || 0) > 0).slice(0, 3);
  const absLosers = byAbs.filter((h) => (h.pnl || 0) < 0).slice(-3).reverse();

  const latestDate = (data.brokers || [])
    .map((b) => b.snapshot_date)
    .filter(Boolean)
    .sort()
    .at(-1);

  return {
    invested,
    current,
    usdInvested: currencyTotals.USD?.total_invested || 0,
    usdCurrent: currencyTotals.USD?.total_cur_val || 0,
    usdPnl: currencyTotals.USD?.total_pnl || 0,
    usdCurrentInr: data.fx?.rate ? (currencyTotals.USD?.total_cur_val || 0) * data.fx.rate : null,
    pnl,
    pnlPct,
    dayPnl: dayCoverage ? dayPnl : null,
    dayPct,
    dayCoverage,
    holdingCount: holdings.length,
    inrHoldingCount: holdings.filter((h) => (h.currency || "INR") === "INR").length,
    fx: data.fx || null,
    brokerCount: (data.brokers || []).length,
    byClass,
    byBroker,
    top5Weight,
    topHolding,
    diversification,
    hhi,
    winners,
    losers,
    absWinners,
    absLosers,
    latestDate,
    holdings,
    brokers: data.brokers || [],
  };
}

export function donutStops(slices) {
  if (!slices.length) return "#d4ddd8 0deg 360deg";
  let cursor = 0;
  return slices
    .map((s) => {
      const start = cursor;
      cursor += (s.pct / 100) * 360;
      return `${s.color} ${start}deg ${cursor}deg`;
    })
    .join(", ");
}
