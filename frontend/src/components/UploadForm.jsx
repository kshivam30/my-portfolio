import { useState, useEffect } from "react";
import { uploadHoldings, getParsers } from "../api";

const SOURCE_TYPES = [
  {
    id: "india",
    label: "India brokers",
    description: "Zerodha Console or Dhan portfolio CSV",
    enabled: true,
  },
  {
    id: "us",
    label: "US brokerage",
    description: "IBKR Activity Statement CSV",
    enabled: true,
  },
  {
    id: "epf",
    label: "EPF passbook",
    description: "EPFO passbook / contribution statement",
    enabled: true,
  },
];

export default function UploadForm({ onUpload, isOpen, onClose }) {
  const [sourceType, setSourceType] = useState("india");
  const [broker, setBroker] = useState("Zerodha");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [parsers, setParsers] = useState([{ name: "Zerodha" }, { name: "Dhan" }]);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    getParsers()
      .then((data) => setParsers(data?.length ? data : [{ name: "Zerodha" }, { name: "Dhan" }]))
      .catch(() => setParsers([{ name: "Zerodha" }, { name: "Dhan" }]));
  }, [isOpen]);

  useEffect(() => {
    if (sourceType === "us") setBroker("IBKR");
    else if (sourceType === "india" && broker === "IBKR") setBroker("Zerodha");
  }, [sourceType]);

  useEffect(() => {
    if (!isOpen) {
      setFile(null);
      setSubmitting(false);
      setSourceType("india");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (sourceType === "india" || sourceType === "us") {
      if (!file) return;
      setSubmitting(true);
      try {
        await uploadHoldings(broker, date, file);
        await onUpload(broker);
        window.__addToast?.(`${broker} snapshot replaced · ${result.rows_replaced} positions · ${result.currency || "INR"}`, "success");
      } catch (err) {
        window.__addToast?.(err.message || "Upload failed", "error");
      } finally {
        setSubmitting(false);
      }
    } else if (sourceType === "epf") {
      if (!file) return;
      setSubmitting(true);
      try {
        const result = await uploadHoldings("EPF", date, file);
        await onUpload("EPF");
        window.__addToast?.(`EPF merged: ${result.inserted} new, ${result.updated} updated (${result.total_rows} total)`, "success");
      } catch (err) {
        window.__addToast?.(err.message || "Upload failed", "error");
      } finally {
        setSubmitting(false);
      }
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  }

  const activeSource = SOURCE_TYPES.find((s) => s.id === sourceType);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-950/35 backdrop-blur-sm animate-fade-in p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-[1.75rem] sm:rounded-[1.75rem] shadow-lift border border-ink-100 w-full max-w-lg max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-ink-100 px-6 py-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-2xl text-ink-950">{sourceType === "epf" ? "Update EPF ledger" : sourceType === "us" ? "Update US holdings" : "Add to portfolio"}</h3>
            <p className="text-sm text-ink-400 mt-1">
              {sourceType === "epf" ? "Merge statement entries into the existing member ledger." : sourceType === "us" ? "Use the statement's end-of-period positions as the complete USD snapshot." : "Replace the latest snapshot for one source. Other sources stay untouched."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-400 hover:text-ink-700 transition p-1"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400 mb-2">
              Source type
            </p>
            <div className="grid grid-cols-1 gap-2">
              {SOURCE_TYPES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSourceType(s.id)}
                  className={`text-left rounded-2xl border px-4 py-3 transition ${
                    sourceType === s.id
                      ? "border-celadon-500 bg-celadon-50/60 ring-1 ring-celadon-500/30"
                      : "border-ink-200 hover:border-ink-300"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-ink-900">{s.label}</span>
                    {!s.enabled && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
                        Coming soon
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-ink-400 mt-0.5">{s.description}</p>
                </button>
              ))}
            </div>
          </div>

          {activeSource?.enabled ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {sourceType !== "epf" && <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-ink-400 mb-2">
                    Broker
                  </label>
                  <select
                    value={broker}
                    onChange={(e) => setBroker(e.target.value)}
                    className="w-full rounded-xl border border-ink-200 bg-mist-25 px-3 py-2.5 text-sm outline-none focus:border-celadon-500 focus:ring-2 focus:ring-celadon-500/20"
                  >
                    {parsers.filter((p) => p.kind === "broker" && (sourceType === "us" ? p.market === "us" : p.market === "india")).map((p) => (
                      <option key={p.name} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                </div>}
                {sourceType === "india" && <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-ink-400 mb-2">
                    Snapshot date
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full rounded-xl border border-ink-200 bg-mist-25 px-3 py-2.5 text-sm outline-none focus:border-celadon-500 focus:ring-2 focus:ring-celadon-500/20"
                  />
                </div>}
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-ink-400 mb-2">
                  Holdings file
                </label>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                  className={`relative rounded-2xl border-2 border-dashed px-4 py-8 text-center transition ${
                    dragOver
                      ? "border-celadon-500 bg-celadon-50"
                      : "border-ink-200 hover:border-celadon-400 hover:bg-mist-50"
                  }`}
                >
                  <input
                    type="file"
                    accept={sourceType === "epf" ? ".pdf,.pdf/*" : ".csv,text/csv"}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                  <p className="text-sm font-medium text-ink-800">
                    {file ? file.name : sourceType === "epf" ? "Drop PDF here or click to browse" : "Drop CSV here or click to browse"}
                  </p>
                  <p className="text-xs text-ink-400 mt-1">
                    {sourceType === "epf"
                      ? "Rows are merged by member and contribution month. Re-uploading a month updates that entry instead of duplicating it."
                      : sourceType === "us"
                          ? "Upload the full IBKR Activity Statement CSV. Open Positions replaces the prior snapshot; YTD trades are not added. Native holdings stay in USD, while totals use a cached daily USD/INR reference rate. Unvested awards are labeled; mixed award lots and unsupported position types are rejected."
                        : "CSV only · replaces prior data for this broker"}
                  </p>
                </div>
              </div>

              {sourceType === "india" && <div className="rounded-2xl bg-mist-50 border border-ink-100 px-4 py-3 text-xs text-ink-500 leading-relaxed">
                <span className="font-semibold text-ink-700">Zerodha:</span> Console → Holdings → Export CSV.
                {" "}
                <span className="font-semibold text-ink-700">Dhan:</span> Portfolio → Export equity CSV.
              </div>}

              <button
                type="submit"
                disabled={submitting || !file}
                className="w-full rounded-2xl bg-ink-900 hover:bg-ink-800 disabled:bg-ink-200 disabled:text-ink-400 text-white font-semibold py-3.5 transition"
              >
                {submitting ? "Uploading…" : sourceType === "epf" ? "Merge EPF entries" : sourceType === "us" ? "Replace IBKR snapshot" : "Update portfolio"}
              </button>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-ink-200 bg-mist-50 px-5 py-10 text-center">
              <p className="font-display text-lg text-ink-800">{activeSource?.label}</p>
              <p className="text-sm text-ink-400 mt-2 max-w-xs mx-auto leading-relaxed">
                Parser support is on the roadmap. The upload flow is ready so India, US, and EPF can share one ledger.
              </p>
              <button
                type="button"
                onClick={() => setSourceType("india")}
                className="mt-5 text-sm font-semibold text-celadon-700 hover:text-celadon-600"
              >
                Upload India holdings instead
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
