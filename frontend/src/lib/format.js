const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const INR_PRECISE = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const NUM = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 2,
});

const NUM_QTY = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

export function formatMoney(value, currency = "INR", { precise = false } = {}) {
  const number = Number(value) || 0;
  return new Intl.NumberFormat(currency === "USD" ? "en-US" : "en-IN", {
    style: "currency",
    currency: currency || "INR",
    minimumFractionDigits: precise || currency === "USD" ? 2 : 0,
    maximumFractionDigits: precise || currency === "USD" ? 2 : 0,
  }).format(number);
}

export function formatINR(value, { precise = false } = {}) {
  const n = Number(value) || 0;
  return (precise ? INR_PRECISE : INR).format(n);
}

export function formatINRCompact(value) {
  const n = Math.abs(Number(value) || 0);
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return formatINR(n);
}

export function formatSignedINR(value, { precise = false } = {}) {
  const n = Number(value) || 0;
  const abs = formatINR(Math.abs(n), { precise });
  if (n > 0) return `+${abs}`;
  if (n < 0) return `−${abs.replace("₹", "₹")}`;
  return abs;
}

export function formatPct(value, { signed = true, digits = 2 } = {}) {
  const n = Number(value) || 0;
  const body = `${Math.abs(n).toFixed(digits)}%`;
  if (!signed) return body;
  if (n > 0) return `+${body}`;
  if (n < 0) return `−${body}`;
  return body;
}

export function formatNum(value) {
  return NUM.format(Number(value) || 0);
}

export function formatQty(value) {
  return NUM_QTY.format(Number(value) || 0);
}

export function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function pnlTone(value) {
  const n = Number(value) || 0;
  if (n > 0) return "text-celadon-600";
  if (n < 0) return "text-coral-600";
  return "text-ink-500";
}
