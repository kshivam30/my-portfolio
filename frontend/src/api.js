const BASE = "/api";

export async function getParsers() {
  const res = await fetch(`${BASE}/parsers`);
  if (!res.ok) throw new Error("Failed to load brokers");
  return res.json();
}

export async function getSnapshots() {
  const res = await fetch(`${BASE}/snapshots`);
  if (!res.ok) return [];
  return res.json();
}

export async function getCumulative() {
  const res = await fetch(`${BASE}/cumulative/latest`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load cumulative data");
  return res.json();
}

export async function getEpfSummary() {
  const res = await fetch(`${BASE}/epf/summary`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load EPF data");
  return res.json();
}

export async function getEpfLedger(memberId = null) {
  const params = new URLSearchParams();
  if (memberId) params.set("member_id", memberId);
  const res = await fetch(`${BASE}/epf/ledger?${params}`);
  if (res.status === 404) return { ledger: [] };
  if (!res.ok) throw new Error("Failed to load EPF ledger");
  return res.json();
}

export async function getIbkrOverview() {
  const res = await fetch(`${BASE}/ibkr`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load IBKR portfolio");
  return res.json();
}

export async function uploadHoldings(broker, snapshotDate, file) {
  const form = new FormData();
  form.append("broker", broker);
  form.append("snapshot_date", snapshotDate);
  form.append("file", file);

  const res = await fetch(`${BASE}/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Upload failed");
  }
  return res.json();
}
